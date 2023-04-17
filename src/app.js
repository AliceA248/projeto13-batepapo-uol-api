import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import joi from "joi";
import dotenv from "dotenv";
import dayjs from "dayjs";
import utf8 from "utf8"

dotenv.config();

const messageValidacaoTipo = joi.object({
  from: joi.string().required(),
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().required().valid("message", "private_message"),
});

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

try {
  await mongoClient.connect();
  db = mongoClient.db();
} catch (error) {

  console.log(error);
  console.log("Não está rodando corretamente");
}

const participantsValidacao = joi.object({
  name: joi.string().trim().required(),
});

// Criação do servidor
const app = express();

// Configurações
app.use(express.json());
app.use(cors());

// Rotas

app.get("/participants", async (req, res) => {
    try {
      const collection = db.collection("participants");
      const participants = await collection.find().toArray();
  
      if (participants.length === 0) {
        res.send([]);
      } else {
        res.send(participants);
      }
    } catch (error) {
      console.error(error);
      res.status(500).send("Erro ao buscar participantes");
    }
  });
  
  app.post("/participants", async (req, res) => {
    const { name } = req.body;
  
    try {
      const participant = await db.collection("participants").findOne({ name });
  
      if (participant) {
        return res.status(409).send("O usuário já existe");
      }
  
      const { error } = participantsValidacao.validate({ name });
  
      if (error) {
        return res.status(422).send(error.details.map((err) => err.message));
      }
  
      const newParticipant = {
        name,
        lastStatus: Date.now(),
      };
  
      const result = await db.collection("participants").insertOne(newParticipant);
  
      const newStatusMessage = {
        from: name,
        to: "Todos",
        text: "Entra na sala....",
        type: "status",
        time: dayjs(Date.now()).format("HH:mm:ss"),
      };
  
      await db.collection("messages").insertOne(newStatusMessage);
  
      res.status(201).send("Tudo certo!");
    } catch (error) {
      console.error(error);
      res.status(500).send("Ocorreu um erro no servidor");
    }
  });
  
  

  app.get("/messages", async (req, res) => {
    const { user } = req.headers;
    const limit = parseInt(req.query.limit);
  
    try {
      const messages = await db
        .collection("messages")
        .find({
          $or: [
            { from: user },
            { to: { $in: [user, "Todos"] } },
            { type: "message" },
          ],
        })
        .sort({ time: -1 })
        .limit(limit)
        .toArray();
  
      res.send(messages);
    } catch (error) {
      console.error(error);
      res.status(500).send("Erro interno no servidor");
    }
  });
  
  

app.post("/messages", async (req, res) => {
    const { to, text, type } = req.body;
    const { user } = req.headers;
  
    const message = {
      from: utf8.decode(user),
      to,
      text,
      type,
      time: dayjs().format("HH:mm:ss"),
    };
    
    const { error } = messageValidacaoTipo.validate({ to, text, type, from: user });
  
    if (error) {
      const errors = error.details.map((e) => e.message);
      return res.status(422).send(errors);
    }
  
    try {
      const participant = await db.collection("participants").findOne({ name: utf8.decode(user) })
  
      if (!participant) {
        return res.status(422).send("Participante não cadastrado");
      }
    
      await db.collection("messages").insertOne(message);
    
      res.status(201).send("Mensagem enviada com sucesso");
      
    } catch (error) {
      console.error(error);
      res.status(500).send("Erro ao enviar a mensagem");
    }
  });
  

app.post("/status", async (req, res) => {
    const { user } = req.headers;
  
    try {
      const participanteCadastrado = await db.collection("participants").findOne({ name: user });
  
      if (!participanteCadastrado) {
        return res.status(404).send("Participante não encontrado");
      }
  
      await db.collection("participants").updateOne(
        { name: user },
        { $set: { lastStatus: Date.now() } }
      );
  
      res.sendStatus(200);
    } catch (error) {
      console.error(error);
      res.status(500).send("Erro ao atualizar status do participante");
    }
  });

  async function checkInactiveParticipants() {
    const menosDez = Date.now() - 100000;

    try {
      const inativos = await db.collection("participants")
        .find({ lastStatus: { $lte: menosDez } })
        .toArray();
  
      if (inativos.length > 0) {
        const mensagensInativas = inativos.map((participant) => {
          return {
            from: participant.name,
            to: "todos",
            text: "sai da sala...",
            type: "status",
            time: dayjs.format("HH:mm:ss")
          };
        });
  
        await db.collection("messages").insertMany(mensagensInativas);
        await db.collection("participants").deleteMany({ lastStatus: { $lte: menosDez } });
      }
    } catch (error) {
      console.log(error);
      res.status(500).send("Erro no setInterval");
    }
  }
  
  setInterval(checkInactiveParticipants, 15000);
  

// Deixa o app escutando, à espera de requisições
const PORT = 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));