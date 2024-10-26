const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const database = require('./database');
const { ObjectId } = require('mongodb');

const API_KEY_BOT = process.env.TG_API_KEY_BOT
const MERCHANT_KEY = process.env.TG_MERCHANT_KEY

const SET_TRAINERS_METHOD = 'ST'
const SET_APPOINTMENT_METHOD = 'SA'
const PAY_APPOINTMENT_METHOD = 'PA'

let bot;

const init = async () => {

    bot = new TelegramBot(API_KEY_BOT, {
        polling: true
    });

    const commands = [
        {
            command: "start",
            description: "Початок роботи"
        },
    ]

    await bot.setMyCommands(commands);
}

const start = async () => {
    const getTrainersButton = '[Select trainer]'
    const getMyAppointmentsButton = '[My appointments]'

    const startHandler = async msg => {
        try {
            const keyboardButtons = [
                [
                    {
                        text: getTrainersButton
                    },
                    {
                        text: getMyAppointmentsButton
                    },
                ],
            ];

            await bot.sendMessage(msg.chat.id, `Welcome, ${msg.from.first_name}\\!`, {
                parse_mode: "MarkdownV2",
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyboardButtons
                }
            });

        } catch (error) {
            console.error(error.body ?? error);
        }
    }

    const getMyAppointmentsHandler = async (msg) => {
        try {
            const chatId = msg.chat.id;

            const userAppointments = await database.db().collection('appointments').find({
                chatId,
                status: "BOOKED_AND_PAID",
            }).toArray();

            if (userAppointments.length === 0) {
                await bot.sendMessage(chatId, `You don't have appointments yet`);
                return;
            }

            await bot.sendMessage(chatId, `Your appointments:\n\n${userAppointments.map(appointment => `[${appointment.slot}] ${appointment.trainerName}`).join('\n\n')}`);

        } catch (error) {
            console.error(error.body ?? error);
        }
    }

    const getTrainersHandler = async (msg) => {
        try {
            const trainers = await database.db().collection('trainers').find({}).toArray();
            if (trainers.length === 0) {
                await bot.sendMessage(msg.chat.id, 'There no trainers yet', {
                    reply_markup: {
                        remove_keyboard: true,
                    }
                });
                return;
            }

            const trainersMedia = trainers.map(trainer => {
                const imgPath = path.resolve(`./${trainer.img}`)
                const imgStream = fs.createReadStream(imgPath);

                return {
                    type: 'photo',
                    media: imgStream
                }
            })

            const selectionText = `Choose your trainer:\n${trainers.map((trainer, i) => `${i + 1}. ${trainer.name}`).join('\n')}`;

            const inlineButtons = trainers.map((trainer, i) => ({
                text: `[${i + 1}]`,
                // Can crash if callback_data is >64bytes
                callback_data: JSON.stringify({
                    m: SET_TRAINERS_METHOD,
                    a: trainer._id.toString()
                })
            }))

            await bot.sendMediaGroup(msg.chat.id, trainersMedia);
            await bot.sendMessage(msg.chat.id, selectionText, {
                reply_markup: {
                    remove_keyboard: true,
                    inline_keyboard: [inlineButtons]
                }
            });
        } catch (error) {
            console.error(error.body ?? error);
        }
    }

    const setTrainerCallbackHandler = async (ctx, trainerId) => {
        try {
            const chatId = ctx.message.chat.id;

            const selectedTrainer = await database.db().collection('trainers').findOne({
                _id: new ObjectId(trainerId)
            })
            if (!selectedTrainer) {
                await bot.sendMessage(chatId, 'No such trainer found. Try again');
                return;
            }

            const inlineButtons = selectedTrainer.openSlots.map(slot => ({
                text: `[${slot}]`,
                // Can crash if callback_data is >64bytes
                callback_data: JSON.stringify({
                    m: SET_APPOINTMENT_METHOD,
                    a: [selectedTrainer._id.toString(), slot]
                })
            }))

            await bot.sendMessage(chatId, `You've selected ${selectedTrainer.name}.\n\n1 hour costs ${selectedTrainer.price} ${selectedTrainer.currency}.\n\n Choose a time for your training:`, {
                reply_markup: {
                    remove_keyboard: true,
                    inline_keyboard: [inlineButtons]
                }
            });

        } catch (error) {
            console.error(error.body ?? error);
        }
    }

    const scheduleAppointmentCallbackHandler = async (ctx, trainerId, slot) => {
        try {
            const chatId = ctx.message.chat.id;

            const selectedTrainer = await database.db().collection('trainers').findOne({
                _id: new ObjectId(trainerId)
            })
            if (!selectedTrainer) {
                await bot.sendMessage(chatId, 'No such trainer found. Try again');
                return;
            }

            const selectedSlot = selectedTrainer.openSlots.find(item => item === slot);
            if (!selectedSlot) {
                await bot.sendMessage(chatId, 'No such time slot found. Try again');
                return;
            }

            const { insertedId } = await database.db().collection('appointments').insertOne({
                createdDate: new Date(),
                trainerId: new ObjectId(trainerId),
                trainerName: selectedTrainer.name,
                slot,
                chatId,
                status: "BOOKED_NOT_PAID",
                price: selectedTrainer.price,
                currency: selectedTrainer.currency,
            })

            const inlineButtons = [
                {
                    text: `[Pay]`,
                    // Can crash if callback_data is >64bytes
                    callback_data: JSON.stringify({
                        m: PAY_APPOINTMENT_METHOD,
                        a: [insertedId.toString()]
                    })
                },
            ]

            await bot.sendMessage(chatId, `You've booked a training with ${selectedTrainer.name} at ${slot}. Proceed with the payment?`, {
                reply_markup: {
                    remove_keyboard: true,
                    inline_keyboard: [inlineButtons]
                }
            });

        } catch (error) {
            console.error(error.body ?? error);
        }
    }

    const payAppointmentCallbackHandler = async (ctx, appointmentId) => {
        try {
            const chatId = ctx.message.chat.id;

            const appointment = await database.db().collection('appointments').findOne({
                _id: new ObjectId(appointmentId),
                chatId,
                status: "BOOKED_NOT_PAID",
            })
            if (!appointment) {
                await bot.sendMessage(chatId, 'No such appointment found. Try again');
                return;
            }

            const amount = Number.parseFloat(appointment.price) * 100

            await bot.sendInvoice(chatId, `New training`, `Training with ${appointment.trainerName} at ${appointment.slot}`, appointmentId, MERCHANT_KEY, appointment.currency, [
                {
                    label: 'New training',
                    amount
                }
            ], {
                protect_content: true
            });

        } catch (error) {
            console.error(error.body ?? error);
        }
    }

    bot.on('callback_query', async ctx => {
        try {
            console.log(`[callback_query] received: `, JSON.stringify(ctx, null, 1))

            const { m: method, a: args } = JSON.parse(ctx.data);

            switch (method) {
                case SET_TRAINERS_METHOD: {
                    await setTrainerCallbackHandler(ctx, args)
                    break;
                }
                case SET_APPOINTMENT_METHOD: {
                    await scheduleAppointmentCallbackHandler(ctx, args[0], args[1])
                    break;
                }
                case PAY_APPOINTMENT_METHOD: {
                    await payAppointmentCallbackHandler(ctx, args[0], args[1])
                    break;
                }
                default:
                    break;
            }
        } catch (error) {
            console.error(error.body ?? error);
        }
    })

    bot.on('text', async msg => {
        console.log(`[text] received:`, JSON.stringify(msg, null, 1))

        try {
            if (msg.text.startsWith('/start')) {
                await startHandler(msg)
            } else if (msg.text == getTrainersButton) {
                await getTrainersHandler(msg)
            } else if (msg.text == getMyAppointmentsButton) {
                await getMyAppointmentsHandler(msg)
            }
        } catch (error) {
            console.error(error.body ?? error);
        }
    });

    bot.on('pre_checkout_query', async (msg) => {
        console.log(`[pre_checkout_query] received:`, JSON.stringify(msg, null, 1))

        try {
            const appointmentId = new ObjectId(msg.invoice_payload)
            const appointment = await database.db().collection('appointments').findOne({
                _id: appointmentId,
                chatId: msg.from.id,
                status: "BOOKED_NOT_PAID",
            });
            const ok = Boolean(appointment);

            await bot.answerPreCheckoutQuery(msg.id, ok, !ok ? 'No such appointment found' : undefined);

        } catch (error) {
            console.error(error.body ?? error);
        }
    });

    bot.on('successful_payment', async (msg) => {
        console.log(`[successful_payment] received:`, JSON.stringify(msg, null, 1))

        try {
            const appointmentId = new ObjectId(msg.successful_payment.invoice_payload)

            await database.db().collection('appointments').updateOne({
                _id: appointmentId,
                chatId: msg.chat.id,
                status: "BOOKED_NOT_PAID",
            }, {
                $set: {
                    status: "BOOKED_AND_PAID",
                }
            });

            await getMyAppointmentsHandler(msg)
        } catch (error) {
            console.error(error.body ?? error);
        }
    });
}

module.exports = {
    init,
    start,
}