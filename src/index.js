require('dotenv').config();
const telegram = require('./telegram');
const database = require('./database');

(async () => {
    console.log('Starting...')

    await database.connect();

    await telegram.init();

    await telegram.start();

    console.log('Waiting for telegram users')
})()