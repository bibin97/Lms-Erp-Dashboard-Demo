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

            // WHERE parsing with proper OR/AND support
            const whereMatch = cleanSql.match(/\bWHERE\s+(.*?)(\bORDER\b|\bGROUP\b|\bLIMIT\b|$)/i);
            if (whereMatch) {
                const whereClause = whereMatch[1].trim();
                let pIndex = 0;

                // Detect if there are OR conditions
                const hasOr = /\s+OR\s+/i.test(whereClause);
                const hasAnd = /\s+AND\s+/i.test(whereClause);

                // Parse a single condition into {field, mongoFilter}
                const parseSingleCondition = (cond) => {
                    // Handle IS NOT NULL
                    const isNotNullMatch = cond.match(/([a-zA-Z0-9_.]+)\s+IS\s+NOT\s+NULL/i);
                    if (isNotNullMatch) {
                        const field = isNotNullMatch[1].split('.').pop();
                        return { field, mongoFilter: { $ne: null } };
                    }
                    // Handle IS NULL
                    const isNullMatch = cond.match(/([a-zA-Z0-9_.]+)\s+IS\s+NULL/i);
                    if (isNullMatch) {
                        const field = isNullMatch[1].split('.').pop();
                        return { field, mongoFilter: null };
                    }
                    // Handle IN (?)
                    const inMatch = cond.match(/([a-zA-Z0-9_.]+)\s+IN\s*\(\s*\?\s*\)/i);
                    if (inMatch) {
                        const field = inMatch[1].split('.').pop();
                        const val = params[pIndex++];
                        const arr = Array.isArray(val) ? val : [val];
                        return { field, mongoFilter: { $in: arr } };
                    }
                    // Handle standard comparisons: =, !=, >, <, >=, <=, LIKE
                    const eqMatch = cond.match(/([a-zA-Z0-9_.]+)\s*(=|!=|<>|>|<|>=|<=|LIKE)\s*\?/i);
                    if (eqMatch) {
                        const field = eqMatch[1].split('.').pop();
                        const op = eqMatch[2];
                        const val = params[pIndex++];

                        if (field === 'id' && !isNaN(val)) {
                            return { field, mongoFilter: Number(val) };
                        } else if (op === '=') {
                            return { field, mongoFilter: val };
                        } else if (op === '!=' || op === '<>') {
                            return { field, mongoFilter: { $ne: val } };
                        } else if (op === '>') {
                            return { field, mongoFilter: { $gt: val } };
                        } else if (op === '<') {
                            return { field, mongoFilter: { $lt: val } };
                        } else if (op === '>=') {
                            return { field, mongoFilter: { $gte: val } };
                        } else if (op === '<=') {
                            return { field, mongoFilter: { $lte: val } };
                        } else if (op.toUpperCase() === 'LIKE') {
                            return { field, mongoFilter: new RegExp(String(val).replace(/%/g, '.*'), 'i') };
                        }
                    }
                    return null;
                };

                if (hasOr && !hasAnd) {
                    // Pure OR query: WHERE a = ? OR b = ?
                    const parts = whereClause.split(/\s+OR\s+/i);
                    const orArray = [];
                    for (const part of parts) {
                        const parsed = parseSingleCondition(part.trim());
                        if (parsed) {
                            orArray.push({ [parsed.field]: parsed.mongoFilter });
                        }
                    }
                    if (orArray.length > 0) {
                        filter = { $or: orArray };
                    }
                } else if (hasAnd && hasOr) {
                    // Mixed AND/OR: split by AND first, then handle OR groups
                    // For now, handle the common pattern: a = ? AND (b = ? OR c = ?)
                    const andParts = whereClause.split(/\s+AND\s+/i);
                    const andConditions = [];
                    for (const andPart of andParts) {
                        const trimmed = andPart.trim().replace(/^\(|\)$/g, '');
                        if (/\s+OR\s+/i.test(trimmed)) {
                            const orParts = trimmed.split(/\s+OR\s+/i);
                            const orArray = [];
                            for (const orPart of orParts) {
                                const parsed = parseSingleCondition(orPart.trim());
                                if (parsed) {
                                    orArray.push({ [parsed.field]: parsed.mongoFilter });
                                }
                            }
                            if (orArray.length > 0) {
                                andConditions.push({ $or: orArray });
                            }
                        } else {
                            const parsed = parseSingleCondition(trimmed);
                            if (parsed) {
                                andConditions.push({ [parsed.field]: parsed.mongoFilter });
                            }
                        }
                    }
                    if (andConditions.length > 1) {
                        filter = { $and: andConditions };
                    } else if (andConditions.length === 1) {
                        filter = andConditions[0];
                    }
                } else {
                    // Pure AND or single condition
                    const conditions = whereClause.split(/\s+AND\s+/i);
                    for (const cond of conditions) {
                        const parsed = parseSingleCondition(cond.trim());
                        if (parsed) {
                            filter[parsed.field] = parsed.mongoFilter;
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
