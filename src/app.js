import express from "express"
import cors from "cors"
import { MongoClient } from "mongodb"
import joi from "joi"
import dotenv from "dotenv"
import dayjs from "dayjs"

dotenv.config()

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

try {
  await mongoClient.connect()
  db = mongoClient.db()
} catch (error) {
    console.log(error)
    console.log("Não está rodando corretamente")
}

const participantsValidação =joi.object({
    name: joi.string().required().min(2)
})

// Criação do servidor
const app = express()

// Configurações
app.use(express.json())
app.use(cors())

// Rotas

app.get("/participants", async (req, res) => {
    try {
        const todosParticipantes = await db.collection("participants").find().toArray()
        res.send(todosParticipantes)
    } catch (error) {
        console.error(error)
        res.status(500).send("O banco não está rodando corretamente")
    }
})

app.post("/participants", async (req, res) => {
    const { name } = req.body

    const { error } = participantsValidação.validate({ name })

    if (error) return res.status(422).send("")

    try {
        const nameCheck = await db.collection("participants").findOne({ name: name})

        if (nameCheck) return res.status(409).send("O usuário já existe")

        await db.collection("participants").insertOne( { name: name, lastStatus: Date.now()}) 

        
        /* 
         {
            from: 'xxx',
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: 'HH:mm:ss'
        }
         */

        await db.collection("messages").insertOne({
            from: name,
            to: "Todos",
            text: "Entra na sala....",
            type: "status",
            time: dayjs(Date.now()).format("HH:mm:ss")

        }) 

        res.status(201).send("Tudo certo!")
        
    } catch (error) {
        res.status(500).send("Servidor não está rodando corretamente")
    }


} )



// Deixa o app escutando, à espera de requisições
const PORT = 5001
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`))