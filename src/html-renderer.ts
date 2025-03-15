import * as cheerio from "cheerio"

function renderElementChildren(elem: cheerio.Element, indentation = 0, baseUrl = "") {
    let text = ""

    if (elem.type == "text")
        return elem.data
    else if (elem.type == "comment")
        return ""

    for (let child of elem.children) {
        if (child.type === "text") {
            text += child.data
            // text += child.data?.replaceAll(/\s+/g, " ")
        }
        else if (child.type === "tag") {
            text += renderELEMENT(child, indentation, baseUrl)
        }
    }
    return text
}

function renderLiElement(elem: cheerio.Element, indentation = 0, baseUrl = "", marker = "*\t") {
    if (elem.type === "text" || elem.type === "comment") {
        return ""
    }
    marker = Object.entries(elem.attribs).filter(v => v[0] === "marker")?.[0]?.[1] ?? marker
    return "\t".repeat(indentation) + marker + renderElementChildren(elem, indentation + 1, baseUrl) + "\n"
}

function renderUlElement(elem: cheerio.Element, indentation = 0, baseUrl = "") {
    let text = ""
    if (elem.type === "text" || elem.type === "comment") {
        return ""
    }

    let marker = Object.entries(elem.attribs).filter(v => v[0] === "marker")?.[0]?.[1] ?? "*\t"
    for (let child of elem.children) {
        if (child.type === "tag") {
            if (child.name === "li") {
                text += renderLiElement(child, indentation + 1, baseUrl, marker)
            }
        }
        else if (child.type === "text") {
            text += child.data?.replaceAll(/\s+/g, " ")
        }
    }
    return text
}

function renderLHElement(elem: cheerio.Element, indentation = 0, baseUrl = "") {
    return `### *${renderElementChildren(elem, indentation, baseUrl)}*`
}

function renderBElement(elem: cheerio.Element, indentation = 0, baseUrl = "") {
    return `**${renderElementChildren(elem, indentation, baseUrl)}**`
}

function renderUElement(elem: cheerio.Element, indentation = 0, baseUrl="") {
    return `__${renderElementChildren(elem, indentation, baseUrl)}__`
}

function renderIElement(elem: cheerio.Element, indentation = 0, baseUrl="") {
    return `*${renderElementChildren(elem, indentation, baseUrl)}*`
}
function renderSElement(elem: cheerio.Element, indentation = 0, baseUrl="") {
    return `~~${renderElementChildren(elem, indentation, baseUrl)}~~`
}

function renderAElement(elem: cheerio.TagElement, indentation = 0, baseUrl = "") {
    let href = Object.entries(elem.attribs).filter(v => v[0] === "href")?.[0]?.[1] ?? ""
    return `${'\t'.repeat(indentation)}[${renderElementChildren(elem, indentation, baseUrl)}](${baseUrl}${href})`
}

function renderBlockcodeElement(elem: cheerio.TagElement, indentation = 0, baseUrl="") {
    return `> ${renderElementChildren(elem, indentation, baseUrl)}`
}

function renderCodeElement(elem: cheerio.Element, indentation = 0, baseUrl = "") {
    let text = "`"
    if (elem.type === "text" || elem.type === "comment") {
        return ""
    }

    let lang = Object.entries(elem.attribs).filter(v => v[0] === "lang")?.[0]?.[1]
    if (lang) {
        text += `\`\`${lang}\n`
    }
    text += renderElementChildren(elem, indentation, baseUrl)
    if (lang) {
        text += "\n``"
    }
    return text + "`"
}

function renderPElement(elem: cheerio.TagElement, indentation = 0, baseUrl = "") {
    return `\n${'\t'.repeat(indentation)}${renderElementChildren(elem, indentation, baseUrl)}\n`
}

function renderHxElement(elem: cheerio.TagElement, indentation = 0, baseUrl = ""){
    return `\n${'\t'.repeat(indentation)}${'#'.repeat(Number(elem.name[1]))} ${renderElementChildren(elem, indentation, baseUrl)}\n`
}

const ELEMENT_RENDERERS: {[key: string]: (elem: cheerio.TagElement, indentation: number, baseUrl: string) => string} = {
    br: (_, indentation) => `\n${"\t".repeat(indentation)}\n`,
    ul: (elem, indentation, baseUrl) => `\n${renderUlElement(elem, indentation, baseUrl)}${"\t".repeat(indentation)}`,
    li: renderLiElement,
    a: renderAElement,
    lh: renderLHElement,
    code: renderCodeElement,
    blockquote: renderBlockcodeElement,
    b: renderBElement,
    string: renderBElement,
    u: renderUElement,
    i: renderIElement,
    del: renderSElement,
    h1: renderHxElement,
    h2: renderHxElement,
    h3: renderHxElement,
    h4: renderHxElement,
    h5: renderHxElement,
    h6: renderHxElement,
    p: renderPElement
}

function renderELEMENT(elem: cheerio.Element, indentation = 0, baseUrl="") {
    let text = ""
    if (elem.type === "tag") {
        indentation = !isNaN(Number(elem.attribs['indent'])) ? indentation + Number(elem.attribs['indent']) : indentation
        if(ELEMENT_RENDERERS[elem.tagName]){
            text += ELEMENT_RENDERERS[elem.tagName](elem, indentation, baseUrl)
        }
        else {
            for (let child of elem.children ?? []) {
                text += renderELEMENT(child, indentation, baseUrl)
            }
        }
    }
    if (elem.type === "text") {
        text += "\t".repeat(indentation) + elem.data?.replaceAll(/\s+/g, " ")
    }
    return text

}

function renderHTML(text: string, indentation = 0, baseUrl = "") {
    let h = cheerio.load(text)("body")[0]
    return renderELEMENT(h, indentation, baseUrl)
}

export default {
    renderHTML,
    renderELEMENT
}
