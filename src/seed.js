const database = require('./database');
const fs = require('fs');

(async () => {
    console.log('Seeding database');

    try {
        await database.connect();

        const templates = {
            trainers: JSON.parse(fs.readFileSync('./src/templates/trainers.json'))
        }

        await database.db().collection('appointments').deleteMany({})
        await database.db().collection('trainers').deleteMany({})

        await Promise.all(Object.entries(templates).map(async ([collection, data]) => {
            await database.db().collection(collection).insertMany(data)
        }))
    } finally {
        database.disconnect()
    }

    console.log('Seeding completed');
})()