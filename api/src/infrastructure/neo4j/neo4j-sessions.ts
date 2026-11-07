import { Driver, Session } from "neo4j-driver";

export async function withSession<T>(
    driver: Driver,
    database: string,
    work: (session: Session) => Promise<T>
): Promise<T> {
    const session = driver.session({ database });
    try {
        return await work(session);
    } finally {
        await session.close();
    }
}
