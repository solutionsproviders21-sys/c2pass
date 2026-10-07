import { MongoClient } from 'mongodb';
import pg from 'pg';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://c2pass:c2pass@localhost:5432/c2pass_tcf_test';
export const TEST_MONGO_URL = process.env.TEST_MONGO_URL ?? 'mongodb://localhost:27017';
export const TEST_MONGO_DB = 'c2pass_test';

/** Fresh databases for every run: the schema is rebuilt by the app's own migrations. */
export default async function setup() {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.end();
  const mongo = await new MongoClient(TEST_MONGO_URL).connect();
  await mongo.db(TEST_MONGO_DB).dropDatabase();
  await mongo.close();
}
