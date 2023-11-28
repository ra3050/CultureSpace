import "dotenv/config"; 

export const database = {
    // host: 'host',
    // user: 'ID',
    // password: 'PW',
    // database: 'DBname'
}

export const AuthDatabase = {
    host : '192.168.0.15',
    // host : '101.101.211.229',
    // host : '127.0.0.1',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
}