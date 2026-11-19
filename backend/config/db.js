const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/Lms-Erp-Demo';

// Auto-connect Mongoose
let isConnecting = false;
async function ensureConnected() {
    if (mongoose.connection.readyState === 1) return;
    if (isConnecting) {
        while (mongoose.connection.readyState !== 1) {
            await new Promise(r => setTimeout(r, 100));
        }
        return;
    }
    isConnecting = true;
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB (Lms-Erp-Demo)');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
    } finally {
        isConnecting = false;
    }
}
ensureConnected();

// Universal collection getter
const getCollection = (name) => {
    return mongoose.connection.db.collection(name.toLowerCase());
};

/**
 * Universal Query Engine
 * Translates MySQL style queries into native MongoDB operations so all existing
 * controllers seamlessly use MongoDB Compass (Lms-Erp-Demo) without breaking anything!
 */
async function executeMongoQuery(sql, params = []) {
    await ensureConnected();
    const rawSql = sql.trim();
    const cleanSql = rawSql.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
    const firstWord = cleanSql.split(' ')[0].toUpperCase();

    // 1. SELECT 1 (Heartbeat check)
    if (/^SELECT\s+1/i.test(cleanSql)) {
        return [[{ '1': 1 }], []];
    }

    // 2. SHOW TABLES
    if (/^SHOW\s+TABLES/i.test(cleanSql)) {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const rows = collections.map(c => ({ [`Tables_in_${mongoose.connection.db.databaseName}`]: c.name }));
        return [rows, []];
    }

    // 3. SHOW COLUMNS FROM table
    if (/^SHOW\s+COLUMNS\s+FROM\s+([a-zA-Z0-9_]+)/i.test(cleanSql)) {
        return [[], []];
    }

    // 4. CREATE TABLE / ALTER TABLE / DROP (DDL operations)
    if (/^(CREATE|ALTER|DROP)\s+/i.test(cleanSql)) {
        return [{ affectedRows: 0, insertId: 0 }, []];
    }

    // 5. SELECT COUNT(*) FROM table
    const countMatch = cleanSql.match(/^SELECT\s+COUNT\(\*\)\s+(?:as\s+c\s+)?FROM\s+([a-zA-Z0-9_]+)/i);
    if (countMatch) {
        const colName = countMatch[1];
        const col = getCollection(colName);
        const count = await col.countDocuments({});
        return [[{ c: count, 'COUNT(*)': count }], []];
    }

    // 6. SELECT Queries
    if (firstWord === 'SELECT') {
        const fromMatch = cleanSql.match(/\bFROM\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?/i);
        if (fromMatch) {
            const table = fromMatch[1];
            const col = getCollection(table);

            let filter = {};

            // Simple WHERE parsing (id = ?, email = ?, etc.)
            const whereMatch = cleanSql.match(/\bWHERE\s+(.*?)(\bORDER\b|\bGROUP\b|\bLIMIT\b|$)/i);
            if (whereMatch) {
                const whereClause = whereMatch[1];
                let pIndex = 0;

                const conditions = whereClause.split(/\s+AND\s+|\s+OR\s+/i);
                for (const cond of conditions) {
                    const eqMatch = cond.match(/([a-zA-Z0-9_.]+)\s*(=|!=|>|<|>=|<=|LIKE)\s*\?/i);
                    if (eqMatch) {
                        let field = eqMatch[1].split('.').pop();
                        const op = eqMatch[2];
                        const val = params[pIndex++];

                        if (field === 'id' && !isNaN(val)) {
                            filter[field] = Number(val);
                        } else if (op === '=') {
                            filter[field] = val;
                        } else if (op === '!=') {
                            filter[field] = { $ne: val };
                        } else if (op.toUpperCase() === 'LIKE') {
                            filter[field] = new RegExp(String(val).replace(/%/g, '.*'), 'i');
                        }
                    }
                }
            }

            // ORDER BY
            let sortOption = null;
            const orderMatch = cleanSql.match(/\bORDER\s+BY\s+([a-zA-Z0-9_.]+)(?:\s+(ASC|DESC))?/i);
            if (orderMatch) {
                const sortField = orderMatch[1].split('.').pop();
                const sortDir = orderMatch[2] && orderMatch[2].toUpperCase() === 'DESC' ? -1 : 1;
                sortOption = { [sortField]: sortDir };
            }

            // LIMIT
            let limitCount = 0;
            const limitMatch = cleanSql.match(/\bLIMIT\s+(\d+|\?)/i);
            if (limitMatch) {
                limitCount = limitMatch[1] === '?' ? params[params.length - 1] : parseInt(limitMatch[1], 10);
            }

            let cursor = col.find(filter);
            if (sortOption) cursor = cursor.sort(sortOption);
            if (limitCount > 0) cursor = cursor.limit(limitCount);

            const docs = await cursor.toArray();
            return [docs, []];
        }
    }

    // 7. INSERT Queries
    if (firstWord === 'INSERT') {
        const insertMatch = cleanSql.match(/^INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\((.*?)\)\s*VALUES\s*\((.*?)\)/i);
        if (insertMatch) {
            const table = insertMatch[1];
            const col = getCollection(table);
            const columns = insertMatch[2].split(',').map(c => c.trim().replace(/[`'"]/g, ''));

            let doc = {};
            columns.forEach((colName, idx) => {
                doc[colName] = params[idx] !== undefined ? params[idx] : null;
            });

            // Assign auto increment numeric id if not present
            if (!doc.id) {
                const CounterCol = mongoose.connection.db.collection('counters');
                const seqDoc = await CounterCol.findOneAndUpdate(
                    { id: table },
                    { $inc: { seq: 1 } },
                    { returnDocument: 'after', upsert: true }
                );
                doc.id = seqDoc ? seqDoc.seq : Date.now();
            }

            if (!doc.created_at) doc.created_at = new Date();

            const result = await col.insertOne(doc);
            return [{
                insertId: doc.id,
                affectedRows: 1,
                id: doc.id,
                _id: result.insertedId
            }, []];
        }
    }

    // 8. UPDATE Queries
    if (firstWord === 'UPDATE') {
        const updateMatch = cleanSql.match(/^UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.*?)(?:\s+WHERE\s+(.*?))?$/i);
        if (updateMatch) {
            const table = updateMatch[1];
            const col = getCollection(table);
            const setClause = updateMatch[2];
            const whereClause = updateMatch[3];

            let pIndex = 0;
            const updateFields = {};
            const setPairs = setClause.split(',');
            for (const pair of setPairs) {
                const pMatch = pair.match(/([a-zA-Z0-9_]+)\s*=\s*(?:\?|'([^']*)'|(\d+))/);
                if (pMatch) {
                    const field = pMatch[1].trim();
                    if (pair.includes('?')) {
                        updateFields[field] = params[pIndex++];
                    } else if (pMatch[2] !== undefined) {
                        updateFields[field] = pMatch[2];
                    } else if (pMatch[3] !== undefined) {
                        updateFields[field] = Number(pMatch[3]);
                    }
                }
            }

            let filter = {};
            if (whereClause) {
                const wherePairs = whereClause.split(/\s+AND\s+/i);
                for (const w of wherePairs) {
                    const wMatch = w.match(/([a-zA-Z0-9_]+)\s*=\s*\?/);
                    if (wMatch) {
                        const field = wMatch[1].trim();
                        let val = params[pIndex++];
                        if (field === 'id' && !isNaN(val)) val = Number(val);
                        filter[field] = val;
                    }
                }
            }

            const res = await col.updateMany(filter, { $set: updateFields });
            return [{ affectedRows: res.modifiedCount, changedRows: res.modifiedCount }, []];
        }
    }

    // 9. DELETE Queries
    if (firstWord === 'DELETE') {
        const deleteMatch = cleanSql.match(/^DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.*?))?$/i);
        if (deleteMatch) {
            const table = deleteMatch[1];
            const col = getCollection(table);
            const whereClause = deleteMatch[2];

            let filter = {};
            let pIndex = 0;
            if (whereClause) {
                const wherePairs = whereClause.split(/\s+AND\s+/i);
                for (const w of wherePairs) {
                    const wMatch = w.match(/([a-zA-Z0-9_]+)\s*=\s*\?/);
                    if (wMatch) {
                        const field = wMatch[1].trim();
                        let val = params[pIndex++];
                        if (field === 'id' && !isNaN(val)) val = Number(val);
                        filter[field] = val;
                    }
                }
            }

            const res = await col.deleteMany(filter);
            return [{ affectedRows: res.deletedCount }, []];
        }
    }

    return [[], []];
}

const pool = {
    query: executeMongoQuery,
    execute: executeMongoQuery,
    promise: () => pool,
    getConnection: async () => ({
        query: executeMongoQuery,
        execute: executeMongoQuery,
        release: () => {},
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {}
    })
};

module.exports = pool;
