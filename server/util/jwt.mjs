import 'dotenv/config'
import crypto from "crypto";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt'
import { auth_Connect } from './DBconnect.js';

// 토큰 언해싱
export const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        /*
            추후 jsonwebtoken 문서를 참고하여 특정에러에 대해 작성해야합니다.
        */
        return null;
    }
}
// access, refresh토큰발급
export const issueToken = (user_id) => {
    /**
     * accessToken과 refreshToken을 발급합니다.
     * super_id의 경우 MASTER, ADMIN권한을 가진 사용자가 요청하였을 때, 사용됩니다
     */
    const data = { user_id: user_id }
    let accessToken = jwt.sign(data,
        process.env.JWT_SECRET,
        {
            expiresIn: '1h',
        }
    );

    let refreshToken = jwt.sign({},
        process.env.JWT_SECRET,
        {
            expiresIn: '14d',
        }
    );

    return { accessToken: accessToken, refreshToken: refreshToken };
}
// access토큰발급
export const issueAccess = (user_id) => {
    /**
     * 엑세스토큰만 발급합니다.
     */
    let accessToken = jwt.sign({ user_id: user_id },
        process.env.JWT_SECRET,
        {
            expiresIn: '1h',
        }
    );

    return accessToken;
}

//accessLevel토큰 발급
export const issueAccessLevel = (user_type, user_id) => {
    let accessToken = jwt.sign({ user_type: user_type, user_id: user_id },
        process.env.JWT_SECRET,
        {
            expiresIn: '1h',
        }
    );

    return accessToken;
}

// 토큰 유효성 검사
export const checkToken = (req, res, next) => {
    const accessToken = verifyToken(req.signedCookies.accessToken);
    const refreshToken = verifyToken(req.signedCookies.refreshToken);

    if (accessToken === null) {
        if (refreshToken === null) {
            // case1. accressToken, refreshToken 모두 없는경우
            // case4. access, refresh 모두 만료된경우
            console.log('토큰 유효기간이 만료되었거나, 쿠키가 없습니다.');

            res.clearCookie('accessToken');
            res.clearCookie('refreshToken');
            res.clearCookie('accessLevelToken');
            res.status(401).send(false);    // 에러반환
        } else {
            console.log('엑세스 토큰 만료, 리프레쉬 토큰 유효')
            // case1. accesstoken 없음, Refresh는 정상적인 경우
            // case3. accessToken만료, Refresh는 정상적인 경우
            res.clearCookie('accessToken');
            res.clearCookie('refreshToken');
            res.clearCookie('accessLevelToken');
            res.status(401).send(false);
        }
    } else {
        /**
         * accessToken, refreshToken이 모두 유효한 경우
         * next() 함수로 다음으로 넘겨줌
         */
        console.log('토큰 유효성 검사 통과');
        next();
    }
}
// 현재 로그인 상태가, 관리자인지 점주인지 확인합니다
export const accessLevelCheck = (req, res) => {
    const accessLevelToken = verifyToken(req.signedCookies.accessLevelToken);
    console.log(accessLevelToken)

    if (!accessLevelToken) {
        return res.send({ accessLevel: false })
    }

    return res.send(accessLevelToken)
}
// 비밀번호 검사
export const comparePassword = (db_PW, input_PW) => {

    const match = bcrypt.compareSync(input_PW, db_PW)

    if (match) {
        return true
    }
    return false
}

export const issuePassword = async (password, callback) => {
    const hash = await bcrypt.hash(password, 10);

    callback(hash)
}
