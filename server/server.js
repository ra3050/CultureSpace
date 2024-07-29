import "dotenv/config"; 
import express from "express";
import http from 'http';
import path from 'path';    
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import fs, { access } from "fs";
import https from 'https'
import { auth_Connect } from "./util/DBconnect";
import { accessLevelCheck, checkToken, comparePassword, issueAccess, issueAccessLevel, issuePassword, issueToken, verifyToken } from "./util/jwt.mjs";
import { nextTick } from "process";
import { makeIdx } from "./util/controll";
import moment from "moment";

const PORT = 8080;  
const __dirname = path.resolve();       //commonjs를 사용하면 기본적으로 __dirname이 포함되어 있지만 ESM에서는 기본적으로 포함되어있지 않다.
const BUILDDIR = "../culture_space/build/";
const KEEPENC = 'ab4c34dd21c8ultu3r9e';

const app = express();
const logger = morgan('dev');

app.use(express.json());            // 유저가 보낸 array/object 데이터를 출력하기 위해 사용
app.use(cors({ credentials: true, origin: "http://localhost:8080"})); // react와 통신을 원활하게 하기위한 미들웨어, 외부클라이언트에서 접근시 에러가 발생하는데 이를 해결하려면 origin을 사용해줘야한다
app.use(logger);                    //서버 접속상태 실시간 확인 라이브러리  
app.use(cookieParser(KEEPENC));     //암호화된 쿠키를 사용하기 위해 임의의 문자 사용                                   
app.use(express.static(path.join(__dirname, "../culture_space/build/")));     //서버에 접속하는 사람들에게 입력한 path추소에서 html파일을 전송함  

// 모든 라우팅 권한을 react로 옮겨줌
app.get('*', function (req, res) {
    res.sendFile(path.join(__dirname, `${BUILDDIR}index.html`));
    console.log('Welcome to myday');
});

app.use('/api/pos/accessCheck/', checkToken)

app.post('/api/pos/signin', (req, res) => {
    const { id, password } = req.body;
    const sql = `SELECT * FROM tbl_users WHERE user_id='${id}'`

    auth_Connect(sql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('로그인중 에러', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        if (!rows.length) {
            console.log('로그인-회원정보 확인불가', error)
            return res.send({errMessage: '회원정보가 없습니다. 정보를 다시 확인해주세요.', result: false})
        }

        /**
         * comparePassword, 입력한 패스워드를 해싱하여 DB값과 비교,
         * 비교한 값이 일치하면 true, 아니면 false
         */
        const compare = comparePassword(rows[0].user_pwd, password)
        console.log(compare)

        if (compare) {
            const user_type = rows[0].user_type

            let accessLevel
            const { accessToken, refreshToken } = issueToken(id);    
            console.log('user_type: ', user_type)
            if (user_type === 'USER_MASTER') {   // mater일 경우
                accessLevel = issueAccessLevel('USER_MASTER', id)
                res.cookie('accessLevelToken', accessLevel, {
                    httpOnly: true,
                    signed: true,
                })
            } else if (user_type === 'USER_ADMIN') {       //admin일 경우
                accessLevel = issueAccessLevel('USER_ADMIN', id)
                res.cookie('accessLevelToken', accessLevel, {
                    httpOnly: true,
                    signed: true,
                })
            }

            res.cookie('accessToken', accessToken, {
                httpOnly: true,
                signed: true,
            })

            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                signed: true,
            })


            return res.send({ result: true })
        } else {
            console.log('비밀번호가 다릅니다', error)
            return res.send({errMessage: '아이디 혹은 비밀번호를 확인해주세요', result: false})
        }
        
    })
    
})

app.post('/api/pos/logout', (req, res) => {
    res.clearCookie('accessToken')
    res.clearCookie('refreshToken')
    res.clearCookie('accessLevelToken');

    return res.send({result: true})
})

app.post('/api/pos/accessLevelCheck', accessLevelCheck)

app.post('/api/pos/accessCheck/totalSales', (req, res) => {
    /** 
     * req.body를 통해 상태바에 필요한 정보를 요청하는지, 계산을 위한 데이터를 요청하는지 확인합니다
     * { sidebar: true } or null
     */
    const id = verifyToken(req.signedCookies.accessToken)
    const accessLevel = verifyToken(req.signedCookies.accessLevelToken)
    
    const userSql = `SELECT * FROM tbl_users`
    auth_Connect(userSql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('매출-매장 데이터 확인중 오류발생', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        if (!rows.length) {
            console.log('유저정보없음')
            return res.send({errMessage: '유저정보 없음', result: false})
        }

        let sql
        let user_data = rows
        let sort_user_data = []
        if (accessLevel?.user_type === 'USER_MASTER') {
            if (accessLevel?.user_id === id.user_id) {
                let user_id = '';
                user_data.map((item, index) => {
                    if (item.ref_id !== id.user_id) {
                        if (item.user_id !== id.user_id) {
                            return
                        }
                    } 
                    sort_user_data = [...sort_user_data, item]
                    if (!user_id) {
                        user_id = user_id + `'${item.user_id}'`
                    } else {
                        user_id = user_id  + ', ' + `'${item.user_id}'` 
                    }
                })
                sql = `SELECT * FROM tbl_shops WHERE owner_id IN (${user_id})`
            } else {
                sql = `SELECT * FROM tbl_shops WHERE owner_id='${id.user_id}'`
            }
        } else if (accessLevel?.user_type === 'USER_ADMIN') {
            if (accessLevel?.user_id === id.user_id) {
                sql = `SELECT * FROM tbl_shops`
            } else {
                let master_id               
                user_data.map(item => {
                    if (item.user_id === id.user_id) {
                        if (item.user_type === 'USER_MASTER') {
                            master_id = item.user_id
                        }
                    } 
                })
                
                if (master_id) {
                    let user_id = '';
                    user_data.map((item, index) => {
                        if (item.ref_id !== master_id) {
                            console.log(item.ref_id, master_id)
                            if (item.user_id !== master_id) {
                                return
                            }
                        } 
                        sort_user_data = [...sort_user_data, item]
                        if (!user_id) {
                            user_id = user_id + `'${item.user_id}'`
                        } else {
                            user_id = user_id  + ', ' + `'${item.user_id}'` 
                        }
                    })
                    sql = `SELECT * FROM tbl_shops WHERE owner_id IN (${user_id})`
                } else {
                    sql = `SELECT * FROM tbl_shops WHERE owner_id='${id.user_id}'`
                }
            }
            
        } else {
            sql = `SELECT * FROM tbl_shops WHERE owner_id='${id.user_id}'`
        }

        auth_Connect(sql, (success, state, rows, error) => {
            if (!success || error) {
                console.log('매출-매장 데이터 확인중 오류발생', error)
                return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
            }
    
            if (!rows.length) {
                console.log('매춣-매장정보, 매장 데이터가 없음')
                return res.send({errMessage: '매장 데이터 없음', result: false})
            }
    
            const beData = rows;
            let shop_id = '';
            beData.map((item, index) => {
                if (!shop_id) {
                    shop_id = shop_id + `'${item.shop_id}'`
                } else {
                    shop_id = shop_id  + ', ' + `'${item.shop_id}'` 
                }
            })
            const eqSql = `SELECT * FROM tbl_equipments WHERE shop_id IN (${shop_id})`
            auth_Connect(eqSql, (success, state, rows, error) => {
                if (!success || error) {
                    console.log('매출-매장-기기 데이터 확인중 오류발생', error)
                    return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
                }
    
                if (!rows.length) {
                    console.log('매출-매장-기기, 데이터가 없음')
                    return res.send({errMessage: '등록된 기기 정보가 없습니다', result: false})
                }
    
                console.log(rows)
                const eqData = rows
                let equipment_id = '';
                eqData.map((item, index) => {
                    if (!equipment_id) {
                        equipment_id = equipment_id + `'${item.equipment_id}'`
                    } else {
                        equipment_id = equipment_id  + ', ' + `'${item.equipment_id}'` 
                    }
                })
    
                const salesSql = `SELECT * FROM tbl_sales WHERE equipment_id IN (${equipment_id})`;
                auth_Connect(salesSql, (success, state, rows, error) => {
                    if (!success || error) {
                        console.log('매출-매장-기기-매출 데이터 확인중 오류발생', error)
                        return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
                    }
                    
                    if (!rows.length) {
                        console.log('매출-매장-기기-매출, 데이터가 없음')
                        return res.send({errMessage: '매출정보를 찾는데 실패했습니다', result: false})
                    }
    
                    const currentTime = moment()

                    return res.send({info: rows, eqInfo: eqData, shopInfo: beData, userInfo: accessLevel?.user_type ? sort_user_data : null, currentTime: currentTime, result: true})
                })
            })
        })            
    })
})

// 브랜드, 기기, 프레임, 결제, 유저 등의 구분자 정보를 가져옵니다
app.post('/api/pos/accessCheck/codeList', (req, res) => {
    const sql = `SELECT * FROM tbl_codes`
    auth_Connect(sql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('tbl_codes 호출중 에러발생', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        if (!rows.length) {
            console.log('tbl_codes 데이터 없음')
            return res.send({errMessage: 'code정보 호출중 에러 발생', result: false})
        }

        return res.send({info: rows, result: true})
    })
})

app.post('/api/pos/accessCheck/frameToDeginer', (req, res) => {
    const sql = `SELECT * FROM tbl_desingers`
    auth_Connect(sql , (success, state, rows, error) => {
        if (!success || error) {
            console.log('디자이너 정보 호출중 에러발생', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        if (!rows.length) {
            console.log('디자이너 정보 없음')
            return res.send({errMessage: '디자이너 정보가 없습니다', result: false})
        }

        console.log(rows)
        let desingers_id = ''
        const designerdata = rows
        designerdata.map((item, index) => {
            if (!index) {
                desingers_id = `'${item.designer_seq}'` + ', '
            } 
            else if (designerdata.length - 1 === index) {
                desingers_id = desingers_id + `'${item.designer_seq}'`
            } else {
                desingers_id = desingers_id + `'${item.designer_seq}'` + ', '
            }
        })

        const designerFrameSql = `SELECT * FROM tbl_frames WHERE designer_seq IN (${desingers_id})`
        auth_Connect(designerFrameSql, (success, state, rows, error) => {
            if (!success || error) {
                console.log('디자이너 프레임 데이터 호출중 에러발생', error)
                return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
            }

            if (!rows.length) {
                console.log('디자이너-프레임 정보 없음')
                return res.send({errMessage: '디자이너의 프레임 정보가 없습니다', result: false})
            }

            return res.send({designer: designerdata, frame: rows, result: true})
        })
        
    })
})

app.post('/api/pos/accessCheck/brandList', (req, res) => {
    const sql = `SELECT * FROM tbl_brands`
    auth_Connect(sql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('브랜드 리스트 호출 실패', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        if (!rows.length) {
            console.log('브랜드 리스트 없음')
            return res.send({errMessage: 'code정보 호출중 에러 발생', result: false})
        }

        console.log('find brand_tbl:', rows)
        return res.send({info: rows, result: true})
    })
})

app.post('/api/pos/accessCheck/goodsList', (req, res) => {
    const sql = `SELECT * FROM tbl_goods`
    auth_Connect(sql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('굿즈 데이터 호출 에러', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        if (!rows.length) {
            console.log('굿즈정보없음')
            return res.send({errMessage: 'code정보 호출중 에러 발생', result: false})
        }

        return res.send({info: rows, result: true})
    })
})

// 점주-주문 
app.post('/api/pos/accessCheck/orderToOwner', (req, res) => {
    const { good_id, good_cnt, shop_id, shop_name, order_price } = req.body;
    const id = verifyToken(req.signedCookies.accessToken)
    console.log(id.user_id)

    const sql = `SELECT * FROM tbl_users WHERE user_id='${id.user_id}'`

    auth_Connect(sql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('주문시도중 에러가 발생했습니다', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }
        console.log(rows)
        if (!rows.length) {
            console.log('해당 점주의 총판관리자가 없습니다')
            return res.send({errMessage: '담당 관리자를 찾는데 실패했습니다', result: false})
        }

        const master_id = rows[0].ref_id;
        const orderSql = `INSERT INTO tbl_orders (good_id ,owner_id, master_id, good_cnt, order_price, shop_id, shop_name) VALUES ('${good_id}', '${id.user_id}', '${master_id}', ${good_cnt}, ${order_price}, '${shop_id}', '${shop_name}');`
        auth_Connect(orderSql, (success, state, rows, error) => {
            if (!success || error) {
                console.log('주문시도중 에러가 발생했습니다', error)
                return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
            }
        })

        return res.send({result: true})
    })
})

// 주문정보 가져오기
app.post('/api/pos/accessCheck/orderToList', (req, res) => {
    const id = verifyToken(req.signedCookies.accessToken)
    const accessLevel = verifyToken(req.signedCookies.accessLevelToken)
    
    console.log(id.user_id)
    let sql = `SELECT * FROM tbl_orders where owner_id='${id.user_id}'`
    if (accessLevel?.user_type === 'USER_MASTER') {
        sql  = `SELECT * FROM tbl_orders WHERE master_id='${accessLevel.user_id}'`
    } else if (accessLevel?.user_type === 'USER_ADMIN') {
        sql = `SELECT * FROM tbl_orders`
    }
    auth_Connect(sql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('주문중 에러가 발생하였습니다', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        if (!rows.length) {
            console.log('해당 점주의 문제점이 있습니다')
            return res.send({errMessage: '담당 관리자를 찾는데 실패했습니다', result: false})
        }

        return res.send({info: rows, result: true})
    })
})

//주문취소
app.post('/api/pos/accessCheck/orderCancel', (req, res) => {
    const { order_id } = req.body
    const id = verifyToken(req.signedCookies.accessToken)
    console.log(id.user_id)
    const sql = `DELETE FROM tbl_orders WHERE order_id = ${order_id} AND owner_id = '${id.user_id}'`
    auth_Connect(sql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('주문취소중 에러발생', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        return res.send({result: true})
    })
})

// 마지막 정산 날짜를 반환합니다
app.post('/api/pos/accessCheck/premiumState', (req, res) => {
    const id = verifyToken(req.signedCookies.accessToken)
    console.log(id.user_id)
    const sql = `SELECT premium_month FROM tbl_users WHERE user_id='${id.user_id}'`
    auth_Connect(sql, (success, state, rows ,error) => {
        if (!success || error) {
            console.log('정산날짜를 찾는 도중 문제가 발생했습니다', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        return res.send({info: rows, result: true})
    })
})

app.post('/api/pos/accessCheck/reIssuePassword', (req ,res) => {
    const { oldpassword, password } = req.body
    
    const id = verifyToken(req.signedCookies.accessToken)
    const sql = `SELECT * FROM tbl_users WHERE user_id='${id.user_id}'`
    auth_Connect(sql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('비밀번호 변경중 에러', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }
        
        if (!rows.length) {
            console.log('회원정보가 없습니다')
            return res.send({errMessage: '회원정보가 없습니다', result: false})
        }
        const match = comparePassword(rows[0].user_pwd, oldpassword)

        if (match) {
        issuePassword(password, changePw => {
            const changeSql = `UPDATE tbl_users SET user_pwd = '${changePw}' WHERE user_id = '${id.user_id}'`
            auth_Connect(changeSql, (success, state, rows, error) => {
                if (!success || error) {
                    console.log('변경할 비밀번호 에러', error)
                    return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
                }

                return res.send({result: true})
            })
        })
            
        } else {
            console.log('기존 비밀번호가 다릅니다')
            return res.send({errMessage: '기존 비밀번호가 일치하지 않습니다.', result: false})
        }
    })

    
})

// * 관리자 master, admin 전용 API
app.post('/api/pos/sidebarList', (req, res) => {
    const accessLevel = verifyToken(req.signedCookies.accessLevelToken);
    const sql = `SELECT * FROM tbl_users`;

    auth_Connect(sql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('유저정보를 가져오는중 에러가 발생했습니다.', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }
        
        if (!rows.length) {
            console.log('회원정보를 가져오는데 실패했습니다')
            return res.send({errMessage: '회원정보가 없습니다', result: false})
        }

        if (accessLevel?.user_type === 'USER_ADMIN') {
            return res.send({info: rows, result: true})
        } else if (accessLevel?.user_type === 'USER_MASTER') {
            let in_master_users = [];
            const data = rows;
            const master_id = accessLevel.user_id
            data?.map(item => {
                if (item.user_id === master_id) {
                    in_master_users = [...in_master_users, item]
                } else if ( item.ref_id === master_id) {
                    in_master_users = [...in_master_users, item]
                }
            })
            return res.send({info: in_master_users, result: true})
        } else {
            return res.send({result: false})
        }
    })
})

// * 관리자 master, admin 전용 API
app.post('/api/pos/changeAccessToken', (req, res) => {
    const { lower_user_id } = req.body 
    res.clearCookie(req.signedCookies.accessToken)
    const accessToken = issueAccess(lower_user_id)

    res.cookie('accessToken', accessToken, {
        httpOnly: true,
        signed: true 
    })

    if (accessToken) {
        return res.send({result: true})
    } else {
        return res.send({result: false})
    }
})

app.use('/api/pos/adminCheck/', (req, res, next) => {
    const accessLevel = verifyToken(req.signedCookies.accessLevelToken);

    if (accessLevel.user_type !== 'USER_ADMIN') {
        return res.status(401).send(false);
    }

    console.log('관리자 검사 통과')
    next()
})

//계정생성
app.post('/api/pos/adminCheck/createMaster', (req, res) => {
    const { user_id, user_pwd, user_name, user_tel, user_addr, user_email, user_info, user_type } = req.body;
    const national_code = 'KR';
    const ref_id = 'admin'
    issuePassword(user_pwd, user_password => {
        const sql = `INSERT INTO tbl_users (user_id, user_pwd, user_name, user_tel, user_addr, user_email, user_info, user_type, national_code, ref_id) VALUES ('${user_id}', '${user_password}', '${user_name}', '${user_tel}', '${user_addr}', '${user_email}', '${user_info}', '${user_type}', '${national_code}', '${ref_id}')`

        auth_Connect(sql, (success, state, rows, error) => {
            if (!success || error) {
                console.log('마스터계정을 생성하는 중 에러가 발생했습니다.', error)
                return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
            }
            
            return res.send({result: true});
        })    
    })
})

app.post('/api/pos/adminCheck/shopList', (req,res) => {
    const { user_id } = req.body    
    const sql = `SELECT * FROM tbl_shops WHERE owner_id='${user_id}'`

    auth_Connect(sql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('매출-매장 데이터 확인중 오류발생', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        if (!rows.length) {
            console.log('매춣-매장정보, 매장 데이터가 없음')
            return res.send({errMessage: '매장 데이터 없음', result: false})
        }

        const beData = rows;
        let shop_id = '';
        beData.map(item => {
            if (!shop_id) {
                shop_id = shop_id + `'${item.shop_id}'`
            } else {
                shop_id = shop_id  + ', ' + `'${item.shop_id}'` 
            }
        })
        const eqSql = `SELECT * FROM tbl_equipments WHERE shop_id IN (${shop_id})`
        auth_Connect(eqSql, (success, state, rows, error) => {
            if (!success || error) {
                console.log('매출-매장-기기 데이터 확인중 오류발생', error)
                return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
            }

            if (!rows.length) {
                console.log('매출-매장-기기, 데이터가 없음')
                return res.send({eqInfo:[], shopInfo: beData, result: true})
            }

            console.log('기기목록: ', rows)
            const eqData = rows

            return res.send({eqInfo: eqData, shopInfo: beData, result: true})
        })
    })            
})

app.post('/api/pos/adminCheck/saveShop', (req, res) => {
    const { shoplist, eqlist } = req.body;
    const brand_code = shoplist?.brand_code?.replace('BRAND_', '');
    const national_code = 'KR';
    const updateShop =  `INSERT INTO tbl_shops (brand_code, shop_id, owner_id, national_code, shop_name, shop_address, shop_zipcode, shop_tel, delete_yn, reg_time) VALUES ('${brand_code}', '${shoplist.shop_id}', '${shoplist.owner_id}', '${national_code}', '${shoplist.shop_name}', '${shoplist.shop_address}', '${shoplist.shop_zipcode}', '${shoplist.shop_tel}', '${shoplist.delete_yn}', now()) ON DUPLICATE KEY UPDATE brand_code = '${brand_code}', owner_id = '${shoplist.owner_id}', national_code='${national_code}', shop_name = '${shoplist.shop_name}', shop_address = '${shoplist.shop_address}', shop_zipcode = '${shoplist.shop_zipcode}', shop_tel = '${shoplist.shop_tel}', delete_yn = '${shoplist.delete_yn}'`

    auth_Connect(updateShop, (success, state, rows, error) => {
        if (!success || error) {
            console.log('매장 생성중 에러발생,', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        let equipment_id = '';
        console.log(`기기리스트: `, eqlist)
        let equipmentInsert = []
        eqlist.map((item, index) => {
            equipmentInsert = [...equipmentInsert, {
                equipment_id: item.equipment_id,
                room_name: item.room_name,
                equipment_type: item.equipment_type,
                install_time: moment(item.install_time).format("YYYY-MM-DD"),
                mac_addr: item.mac_addr,
                shop_id: item.shop_id,
                remained_sheets: 200
            }]
            
            if (!equipment_id) {
                equipment_id = equipment_id + `'${item.equipment_id}'`
                
            } else {
                equipment_id = equipment_id  + ', ' + `'${item.equipment_id}'` 
            }

        })
        
        const equipmentSql = `INSERT INTO tbl_equipments (equipment_id, room_name, equipment_type, install_time, mac_addr, shop_id, remained_sheets) VALUES ${equipmentInsert.map(row => `('${row.equipment_id}', '${row.room_name}', '${row.equipment_type}', '${row.install_time}', '${row.mac_addr}', '${row.shop_id}' ,'${row.remained_sheets}')`).join(', ')} ON DUPLICATE KEY UPDATE equipment_id = VALUES(equipment_id), room_name = VALUES(room_name), equipment_type = VALUES(equipment_type), install_time = VALUES(install_time), mac_addr = VALUES(mac_addr), shop_id = VALUES(shop_id), remained_sheets= VALUES(remained_sheets)`
        // `${equipmentInsert.map(row => (`room_name='${row.room_name}', equipment_type='${row.equipment_type}', install_time='${row.install_time}', mac_addr='${row.mac_addr}', shop_id='${row.shop_id}', remained_sheets='${row.remained_sheets}'`))}`
        auth_Connect(equipmentSql, (success, state, rows, error) => {
            if (!success || error) {
                console.log('기기 등록 실패, 업데이트 진행', error)        
                return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
                //업데이트 코드 작성
            } else {
                console.log(rows)
                return res.send({result: true})
                
            }
        })
    })
})

app.post('/api/pos/adminCheck/makeID', (req, res) => {
    const { tag } = req.body; 
    console.log(tag)
    const id = makeIdx(tag) 

    return res.send({id: id, result: true})
})

app.post('/api/pos/adminCheck/updateUserInfo', (req, res) => {
    const { user_id, user_name, user_tel, user_addr, user_email, user_info, ref_id } = req.body;
    const updateSql = `UPDATE tbl_users SET user_name='${user_name}', user_tel='${user_tel}', user_addr='${user_addr}', user_email='${user_email}', user_info='${user_info}', ref_id='${ref_id}' WHERE user_id='${user_id}'`

    auth_Connect(updateSql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('계정정보 업데이트중 에러발생,', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        return res.send({result: true})
    })
})

app.post('/api/pos/adminCheck/deleteUser', (req, res) => {
    const { user_id , shoplist, eqlist } = req.body;
    const sql = `UPDATE tbl_users SET delete_yn = 'y', del_time = now() WHERE user_id = '${user_id}'`
    
    auth_Connect(sql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('유저정보 삭제중 에러발생', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        let shop = '';
        shoplist.map(item => {
            if (!shop) {
                shop = shop + `'${item.shop_id}'`
            } else {
                shop = shop  + ', ' + `'${item.shop_id}'` 
            }
        })

        const shopSql = `UPDATE tbl_shops SET delete_yn='y', del_time = now() WHERE shop_id IN (${shop})`
        auth_Connect(shopSql, (success, state, rows, error) => {
            if (!success || error) {
                console.log('유저정보 삭제중 에러발생', error)
                return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
            }

            let equipment = '';
            eqlist.map(item => {
                if (!equipment) {
                    equipment = equipment + `'${item.equipment_id}'`
                } else {
                    equipment = equipment  + ', ' + `'${item.equipment_id}'` 
                }
            })

           const equipmentSql = `UPDATE tbl_equipments SET delete_yn='y', del_time = now() WHERE equipment_id IN (${equipment})`
            auth_Connect(equipmentSql, (success, state, rows, error) => {
                if (!success || error) {
                    console.log('유저정보 삭제중 에러발생', error)
                    return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
                }

                return res.send({result: true})
            })
        })
    })
})

app.post('/api/pos/adminCheck/deleteShop', (req, res) => {
    const { shoplist, eqlist } = req.body;

    const shopSql = `UPDATE tbl_shops SET delete_yn='y', del_time = now() WHERE shop_id='${shoplist.shop_id}'`
    auth_Connect(shopSql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('유저정보 삭제중 에러발생', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        let equipment = '';
        eqlist.map(item => {
            if (!equipment) {
                equipment = equipment + `'${item.equipment_id}'`
            } else {
                equipment = equipment  + ', ' + `'${item.equipment_id}'` 
            }
        })

        if (!equipment) {
            return res.send({result: true})
        }
        const equipmentSql = `UPDATE tbl_equipments SET delete_yn='y', del_time = now() WHERE equipment_id IN (${equipment})`
        auth_Connect(equipmentSql, (success, state, rows, error) => {
            if (!success || error) {
                console.log('유저정보 삭제중 에러발생', error)
                return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
            }

            return res.send({result: true})
        })
    })
})

app.post('/api/pos/adminCheck/deleteEquipment', (req, res) => {
    const { eqlist } = req.body;

    let equipment = '';
    eqlist.map(item => {
        if (!equipment) {
            equipment = equipment + `'${item.equipment_id}'`
        } else {
            equipment = equipment  + ', ' + `'${item.equipment_id}'` 
        }
    })

    const equipmentSql = `UPDATE tbl_equipments SET delete_yn='y', del_time = now() WHERE equipment_id IN (${equipment})`
    auth_Connect(equipmentSql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('유저정보 삭제중 에러발생', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        return res.send({result: true})
    })
})

app.post('/api/pos/adminCheck/successOrder', (req, res) => {
    const { order_id } = req.body;
    const sql = `UPDATE tbl_orders SET state=1, state_complete_time=now() WHERE order_id=${order_id}`
    auth_Connect(sql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('유저정보 삭제중 에러발생', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        return res.send({result: true})
    })
})

app.post('/api/pos/adminCheck/deleteOrder', (req, res) => {
    const { order_id } = req.body;
    const sql = `UPDATE tbl_orders SET delete_yn='y' WHERE order_id=${order_id}`
    auth_Connect(sql, (success, state, rows, error) => {
        if (!success || error) {
            console.log('유저정보 삭제중 에러발생', error)
            return res.send({errMessage: '서버에러가 발생하였습니다. 관리자에게 문의해주세요', result: false})
        }

        return res.send({result: true})
    })
})

// // 아래부터 SSL 인증과 서버 오픈을 위한 명령어
// const options = {
//     key: fs.readFileSync(path.join(__dirname, process.env.SSL_KEY_PATH)),
//     cert: fs.readFileSync(path.join(__dirname, process.env.SSL_CRT_PATH)),
//     ca: fs.readFileSync(path.join(__dirname, process.env.SSL_CA_PATH))
// }
// const server = https.createServer(options, app)             //https 서버생성
// const httpServer = http.createServer((req, res) => {
//     res.writeHead(301, { 'Location': 'https://www.pzone.info' });
//     res.end();
// })                      //http 서버생성

// httpServer.listen(8080, () => {
//     console.log('컬처스페이스 POS페이지( - http)에 오신것을 환영합니다')
// })

// server.listen(PORT, () => {
//     console.log('컬처스페이스 POS페이지에 오신것을 환영합니다')
// })

app.listen(PORT, console.log("컬처스페이스 POS 시스템에 오신것을 환영합니다."));