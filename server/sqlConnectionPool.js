import mysql from "mysql2/promise"

export const sqlConnectionPool = await mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '123456',
});

export const honeycombDBConnectionPool = await mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '123456',
  database: 'Honeycomb',
});