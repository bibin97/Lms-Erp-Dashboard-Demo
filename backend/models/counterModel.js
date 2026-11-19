const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 }
});

const Counter = mongoose.model('Counter', CounterSchema);

async function getNextSequence(sequenceName) {
    const counter = await Counter.findOneAndUpdate(
        { id: sequenceName },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return counter.seq;
}

module.exports = { Counter, getNextSequence };
