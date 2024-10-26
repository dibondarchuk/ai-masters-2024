const { MongoClient, ServerApiVersion } = require('mongodb');

const database = process.env.DB_DATABASE
const host = process.env.DB_HOST
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${host}`;

let client;

const db = () => client?.db(database);

const connect = async () => {
    console.log(`Connecting to ${host}/${database}...`);
    client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        }
    });
    await client.connect();
}

const disconnect = () => {
    client?.close().catch();
    client = null;
}

module.exports = {
    db,
    connect,
    disconnect,
}