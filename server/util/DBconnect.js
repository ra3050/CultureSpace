import mysql from "mysql";
import { database, AuthDatabase } from "../config/db.mjs";

export const auth_Connect = (query, callback) => {
    /**
     * DB와 연결하여 쿼리를 실행합니다
     * 결과에따라 (success, state, rows, error)를 반환합니다.
     * 콜백함수로 처리가 가능하도록 합니다.
     * fields를 사용하는 경우, 콜백함수에 추가해야합니다.
     */

    const connection = mysql.createConnection(AuthDatabase);
    connection.connect((error) => {
        if (error) callback(false, 503, {}, error);
        connection.query(query, (error, rows, fields) => {
            if (error) callback(false, 503, {}, error);
            else callback(true, 200, rows, error);
        })
        connection.end();
    })
}