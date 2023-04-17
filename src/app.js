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
        text: "entra na sala...",
        type: "status",
        time: dayjs(Date.now()).format("HH:mm:ss"),
      };
  
      await db.collection("messages").insertOne(newStatusMessage);
  
      res.status(201).send("Tudo certo!");
    } catch (error) {
      console.error(error);
      res.status(500).send("Erro no servidor");
    }
  });
  
  

  app.get("/messages", async (req, res) => {
    const { user } = req.headers;
    const limit = parseInt(req.query.limit);
    const limitSchema = joi.object({
        limit: joi.number().integer().positive().min(1)
    })
    const validation = limitSchema.validate(limit)
    if ( validation.error) return res.sendStatus(422)
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
      res.status(500).send("Erro no servidor");
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
    
      res.status(201).send("Mensagem enviada!");
      
    } catch (error) {
      console.error(error);
      res.status(500).send("Erro ao enviar a mensagem");
    }
  });
  

  app.post("/status", async (req, res) => {
    const participantName = req.header("User");
    if (!participantName) {
      res.status(404).send({ message: "Participante não encontrado" });
      return;
    }
  
    try {
      const participant = await db.collection("participants").findOne({ name: participantName });
      if (!participant) {
        res.status(404).send({ message: "Participante não encontrado" });
        return;
      }
  
      await db.collection("participants").updateOne(
        { _id: participant._id },
        { $set: { lastStatus: Date.now() } }
      );
  
      res.status(200).send();
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Erro ao atualizar status do participante" });
    }
  });
  
  setInterval(async () => {
    const inatividade = Date.now() - 10000;
  
    try {
      const inactiveParticipants = await db.collection("participants")
        .find({ lastStatus: { $lte: inatividade } })
        .toArray();
  
      if (inactiveParticipants.length > 0) {
        const inactiveMessages = inactiveParticipants.map((participant) => {
          return {
            from: participant.name,
            to: "Todos",
            text: "sai da sala...",
            type: "status",
            time: dayjs().format("HH:mm:ss"),
          };
        });
  
        await db.collection("messages").insertMany(inactiveMessages);
        await db.collection("participants").deleteMany({ lastStatus: { $lte: inatividade } });
      }
    } catch (error) {
      console.error(error);
    }
  }, 15000);
  

// Deixa o app escutando, à espera de requisições
const PORT = 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));