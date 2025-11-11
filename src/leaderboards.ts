import { Database } from 'bun:sqlite'
import { randomUUID } from 'crypto'

let db = new Database("./database/leaderboards.db")

db.exec("CREATE TABLE IF NOT EXISTS leaderboards (id INTEGER UNIQUE, name TEXT UNIQUE)")
db.exec("CREATE TABLE IF NOT EXISTS users (discordId TEXT, leaderboardId INTEGER)")
db.exec("CREATE TABLE IF NOT EXISTS scores (discordId TEXT, points INTEGER, leaderboardId INTEGER)")

function list(): string[] {
    const names = db.query("SELECT name FROM leaderboards").all()

    return names.map(v => v["name"])
}


function score_change(discordId: string, leaderboardId: number, amount: number) {
    db.prepare(`
    UPDATE scores SET points = points + ? WHERE discordId = ? and leaderboardId = ?
`).run(amount, discordId, leaderboardId)
}

function create(name: string): number {
    const id = Math.floor(Math.random() * 100000)
    const stmnt = db.query("INSERT INTO leaderboards (id, name) VALUES (?, ?)")
    stmnt.run(id, name)
    return id
}

function lbname2id(name: string): number {
    const id = db.prepare("SELECT id FROM leaderboards WHERE name == ?").get(name)
    return id["id"]
}

function add_player_to_leaderboard(discordId: string, leaderbord: number) {
    db.prepare(`
INSERT INTO users
    (discordId, leaderboardId)
VALUES (?, ?)`
    )
        .get(discordId, leaderbord)

    db.prepare(`
INSERT INTO scores
    (discordId, points, leaderboardId)
VALUES (?, 0, ?)`
    )
        .get(discordId, leaderbord)
}

function list_scores(leaderboardId: number) {
    return db.prepare(
        `
SELECT users.discordid, points
FROM users
    INNER JOIN scores ON
        users.leaderboardId = scores.leaderboardId
        AND users.discordId = scores.discordId
WHERE users.leaderboardId = ?
ORDER BY points DESC
`
    ).all(leaderboardId)
}

export default {
    list,
    create,
    add_player_to_leaderboard,
    lbname2id,
    list_scores,
    score_change
}
