import { v4 } from "uuid";

export const makeIdx = (type) => {
    /**
     * type형태의 idx를 만들어 반환합니다.
     * uuid:v4를 사용하여 램덤값을 만듭니다.
     * :: type_uuidv4를 사용하여 만들어낸 값
     */
    const randomUUID = v4().replace(/_/g, '');

    return `${type}${randomUUID.substr(0, 6).toUpperCase()}`;
}      