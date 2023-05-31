import cheerio from 'cheerio'

import { isBetween } from "./util"

function renderElementChildren(elem: cheerio.Element, indentation = 0) {
    let text = ""

    if (elem.type == "text")
        return elem.data
    else if (elem.type == "comment")
        return ""

    for (let child of elem.children) {
        if (child.type === "text") {
            text += child.data?.replaceAll(/\s+/g, " ")
        }
        else if (child.type === "tag") {
            text += renderELEMENT(child, indentation)
        }
    }
    return text
}

function renderLiElement(elem: cheerio.Element, indentation = 0, marker = "*\t") {
    if (elem.type === "text" || elem.type === "comment") {
        return ""
    }
    marker = Object.entries(elem.attribs).filter(v => v[0] === "marker")?.[0]?.[1] ?? marker
    return "\t".repeat(indentation) + marker + renderElementChildren(elem, indentation + 1) + "\n"
}

function renderUlElement(elem: cheerio.Element, indentation = 0, marker = "*\t") {
    let text = ""
    if (elem.type === "text" || elem.type === "comment") {
        return ""
    }

    marker = Object.entries(elem.attribs).filter(v => v[0] === "marker")?.[0]?.[1] ?? marker
    for (let child of elem.children) {
        if (child.type === "tag") {
            if (child.name === "li") {
                text += renderLiElement(child, indentation + 1, marker)
            }
        }
        else if (child.type === "text") {
            text += child.data?.replaceAll(/\s+/g, " ")
        }
    }
    return text
}

function renderLHElement(elem: cheerio.Element, indentation = 0) {
    return `### *${renderElementChildren(elem, indentation)}*`
}

function renderBElement(elem: cheerio.Element, indentation = 0) {
    return `**${renderElementChildren(elem, indentation)}**`
}

function renderUElement(elem: cheerio.Element, indentation = 0) {
    return `__${renderElementChildren(elem, indentation)}__`
}

function renderIElement(elem: cheerio.Element, indentation = 0) {
    return `*${renderElementChildren(elem, indentation)}*`
}
function renderSElement(elem: cheerio.Element, indentation = 0) {
    return `~~${renderElementChildren(elem, indentation)}~~`
}

function renderAElement(elem: cheerio.TagElement, indentation = 0) {
    let href = Object.entries(elem.attribs).filter(v => v[0] === "href")?.[0]?.[1] ?? ""
    return `${'\t'.repeat(indentation)}[${renderElementChildren(elem)}](${href})`
}

function renderBlockcodeElement(elem: cheerio.TagElement, indentation = 0) {
    return `> ${renderElementChildren(elem)}`
}

function renderCodeElement(elem: cheerio.Element, indentation = 0) {
    let text = "`"
    if (elem.type === "text" || elem.type === "comment") {
        return ""
    }

    let lang = Object.entries(elem.attribs).filter(v => v[0] === "lang")?.[0]?.[1]
    if (lang) {
        text += `\`\`${lang}\`\`\n`
    }
    text += renderElementChildren(elem, indentation)
    if (lang) {
        text += "\n``"
    }
    return text + "`"
}

function renderPElement(elem: cheerio.TagElement, indentation = 0) {
    return `\n${'\t'.repeat(indentation)}${renderElementChildren(elem, indentation)}\n`
}

function renderHxElement(elem: cheerio.TagElement, indentation = 0){
    return `\n${'\t'.repeat(indentation)}${'#'.repeat(Number(elem.name[1]))} ${renderElementChildren(elem, indentation)}\n`
}
//
// function renderAElement(elem: cheerio.TagElement, indentation = 0){
//     return `\n${'\t'.repeat(indentation)}[${renderElementChildren(elem, indentation)}](${elem.attribs['href'] || ""})`
// }

function renderELEMENT(elem: cheerio.Element, indentation = 0) {
    let text = ""
    if (elem.type === "tag") {
        indentation = !isNaN(Number(elem.attribs['indent'])) ? indentation + Number(elem.attribs['indent']) : indentation
        if (elem.name === "br") {
            text += `\n${"\t".repeat(indentation)}`
        }
        else if (elem.name === "ul") {
            text += `\n${renderUlElement(elem, indentation)}${"\t".repeat(indentation)}`
        }
        else if (elem.name === "a") {
            text += renderAElement(elem, indentation)
        }
        else if (elem.name === "lh") {
            text += renderLHElement(elem, indentation)
        }
        else if (elem.name === "code") {
            text += renderCodeElement(elem, indentation)
        }
        else if (elem.name === "blockquote") {
            text += renderBlockcodeElement(elem, indentation)
        }
        else if (["strong", "b"].includes(elem.name)) {
            text += renderBElement(elem, indentation)
        }
        else if (elem.name === "u") {
            text += renderUElement(elem, indentation)
        }
        else if (["i"].includes(elem.name)) {
            text += renderIElement(elem, indentation)
        }
        else if (["del"].includes(elem.name)) {
            text += renderSElement(elem, indentation)
        }
        else if (elem.name.length === 2 && elem.name[0] === 'h' && isBetween(0, Number(elem.name[1]), 7)){
            text += renderHxElement(elem, indentation)
        }
        else if (elem.name === "p") {
            text += renderPElement(elem, indentation)
        }
        else if(elem.name.startsWith("h") && "1234".includes(elem.name[1]) && elem.name.length === 2){
            text += renderHxElement(elem, indentation)
        }
        else {
            for (let child of elem.children ?? []) {
                text += renderELEMENT(child, indentation)
            }
        }
    }
    if (elem.type === "text") {
        text += "\t".repeat(indentation) + elem.data?.replaceAll(/\s+/g, " ")
    }
    return text

}

function renderHTML(text: string, indentation = 0) {
    let h = cheerio.load(text)("body")[0]
    return renderELEMENT(h, indentation)
}

export default {
    renderHTML,
    renderELEMENT
}
