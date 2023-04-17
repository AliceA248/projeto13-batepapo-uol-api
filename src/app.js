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
    const todosParticipantes = await db.collection("participants").find().toArray();

    if (!todosParticipantes.length) {
      return res.status(404).send("Nenhum usuário foi encontrado");
    }

    res.send(todosParticipantes);
  } catch (error) {
    console.error(error);
    res.status(500).send("O banco não está rodando corretamente");
  }
});

app.post("/participants", async (req, res) => {
  const { name } = req.body;

  const { error } = participantsValidacao.validate({ name });

  if (error) {
    return res.status(422).send(error.details.map((err) => err.message));
  }

  try {
    const nameCheck = await db.collection("participants").findOne({ name });

    if (nameCheck) {
      return res.status(409).send("O usuário já existe");
    }

    await db.collection("participants").insertOne({
      name,
      lastStatus: Date.now(),
    });

    await db.collection("messages").insertOne({
      from: name,
      to: "Todos",
      text: "Entra na sala....",
      type: "status",
      time: dayjs(Date.now()).format("HH:mm:ss"),
    });

    res.status(201).send("Tudo certo!");
  } catch (error) {
    console.error(error);
    res.status(500).send("Servidor não está rodando corretamente");
  }
});

app.get("/messages", async (req, res) =>{
    const { user } = req.headers
    const limit = parseInt(req.query.limit)

    try {

        const todasMensagens = await db.collection("messages").find({ $or: [
            { from: user },
            { to: { $in: [user, "todos"]} },
            { type: "message" }
        ]
    }).limit(limit).toArray()

        res.send(todasMensagens)
        
    } catch (error) {
        console.log(error)
        res.status(500).send("Problema no servidor")
    }

} )

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const { user } = req.headers;

  const novaMensagem = {
    to,
    text,
    type,
    from: user,
  };

  const { error } = messageValidacaoTipo.validate({ to, text, type, from: user });

  if (error) {
    const erroMensagem = error.details.map((e) => e.message);
    return res.status(422).send(erroMensagem);
  }

  try {
    const participanteCadastrado = await db.collection("participants").findOne({ name: utf8.decode(user) })

    if (!participanteCadastrado) return res.status(422).send() 
  
  
  
    await db.collection("messages").insertOne({
      ...novaMensagem,
      time: dayjs().format("HH:mm:ss"),
    });
  
    res.status(201).send("Tudo rodando corretamente");
    
  } catch (error) {
    res.status(500).send("Não está rodando corretamente no banco de dados")
  }


});

app.post("/status", async (req, res) => {
    const { user } = req.headers

    try {

        const participanteCadastrado = await db.collection("participants").findOne({ name: user })
        if (!participanteCadastrado) return res.status(404)

        await db.collection("participants").updateOne({ name: user}, { $set: { lastStatus: Date.now() }})

        res.sendStatus(200)
        
    } catch (error) {
        res.status(500).send("Erro no banco de dados")
        
    }
})


// Deixa o app escutando, à espera de requisições
const PORT = 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
  