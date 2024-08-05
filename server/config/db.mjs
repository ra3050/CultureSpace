import "dotenv/config";

export const database = {
    // host: 'host',
    // user: 'ID',
    // password: 'PW',
    // database: 'DBname'
}

export const AuthDatabase = {
    host: '172.30.1.99',                  // DB 접속 IP로 수정
    // host : '101.101.211.229',
    // host : '127.0.0.1',
    user: process.env.DB_USER,              // .env파일, db유저네임
    password: process.env.DB_PASSWORD,      // .env파일, db유저PW
    database: process.env.DB_NAME           // .env파일, db이름
}