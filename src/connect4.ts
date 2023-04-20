import { enumerate, range } from "./util";

type BoardCharacter = "O" | "R" | "B" | string

export type Board = BoardCharacter[][]

function strNumberToEmoji(number: string) {
    Array.from(number, n => `${n}\u{fe0f}\u{20e3}`).join("")
}

function createBoard(rows = 6, cols = 7) {
    let board: Board = []
    for (let i = 0; i < rows; i++) {
        board.push(Array.from({length: cols}, () => "O"))
    }
    return board
}

function boardIsFull(board: Board){
    let columns = Array.from({length: board[0].length}, (_, colNo) => Array.from(board, row => row[colNo]).filter(v => v === "O"))
    for(let column of columns){
        if(column.length){
            return false
        }
    }
    return true
}

function createBoardText(board: Board, redplayer = '🔴', blueplayer = '🔵') {
    let text = "```\n"
    for (let [idx, _] of enumerate(board[0])) {
        text += `|${strNumberToEmoji(String(idx + 1))}`
    }
    text += '|\n'
    for (let [_rowN, row] of enumerate(board)) {
        //fixes a missing bar at the start of each row
        text += "|"
        for (let [colN, point] of enumerate(row)) {
            switch (point) {
                case "R":
                    text += redplayer
                    if(String(colN).length > redplayer.length){
                        text += " ".repeat(String(colN).length - redplayer.length)
                    }
                    break;
                case "B":
                    text += blueplayer
                    if(String(colN).length > blueplayer.length){
                        text += " ".repeat(String(colN).length - blueplayer.length)
                    }
                    break;
                default:
                    text += "⚪"
                    if(String(colN).length > "⚪".length){
                        text += " ".repeat(String(colN).length - "⚪".length)
                    }
            }
            text += "|"
        }
        text += '\n'
    }
    return text + "```"
}

/**
    * @description places a piece in a column, should only be used if canPlaceInColumn returned true
*/
function placeColorInColumn(board: Board, color: "R" | "B", column: number) {
    let lowestRow = board[0].length;
    for (let [rowNo, row] of enumerate(board.reverse())) {
        if (row[column] === "O") {
            //board.legth is the column count
            lowestRow = board.length - rowNo - 1
            break
        }
    }
    board.reverse()[lowestRow][column] = color
    return board
}

function canPlaceInColumn(board: Board, column: number) {
    for (let row of board) {
        if (row[column] === "O") {
            return true
        }
    }
    return false
}

function checkWinInColumnOrRow(rowOrColumn: Board[number], needed = 4) {
    let inARow = 1
    let previous = rowOrColumn[0]
    for (let item of rowOrColumn.slice(1)) {
        if (item === "O") {
            inARow = 0
        }
        else if (item === previous)
            inARow++
        else if (item !== "O") {
            inARow = 1;
        }
        else inARow = 0
        if (inARow === needed) {
            return true
        }
        previous = item
    }
    return false
}

function checkDiagonalWins(board: Board, needed = 4) {
    for (let rowNo = 0; rowNo < board.length - (needed - 1); rowNo++) {
        for (let colNo = 0; colNo < board[rowNo].length - (needed - 1); colNo++) {
            let inARow = 0;
            let item = board[rowNo][colNo]
            let previous = item
            for (let i = 0; i < needed; i++) {
                item = board[rowNo + i][colNo + i]
                if (item === "O") {
                    inARow = 0;
                }
                else if (item === previous)
                    inARow++
                else if (item !== "O") {
                    inARow = 1;
                }
                else inARow = 0
                previous = item
            }
            if(inARow === needed){
                return true
            }
        }
    }
    return false
}

function checkWin(board: Board, needed = 4) {
    let hasWon = false
    for (let row of board) {
        if (checkWinInColumnOrRow(row, needed)) {
            hasWon = true
        }
    }
    let columns = Array.from(range(0, board[0].length), (colNo) => Array.from(board, row => row[colNo]))
    for (let column of columns) {
        if (checkWinInColumnOrRow(column, needed)) {
            hasWon = true
        }
    }
    if (checkDiagonalWins(board, needed)) {
        hasWon = true
    }
    if(checkDiagonalWins(board.reverse(), needed)){
        hasWon = true
    }
    board.reverse()
    return hasWon
}

export default {
    createBoardText,
    createBoard,
    placeColorInColumn,
    canPlaceInColumn,
    checkWin,
    boardIsFull
}
