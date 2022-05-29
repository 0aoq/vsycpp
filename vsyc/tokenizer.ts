/**
 * @file Handle tokenization of a string
 * @name tokenizer.js
 * @author 0aoq <hkau@oxvs.net>
 * @license Apache-2.0
 */

// functions

/**
 * @global
 * @name typeList
 * @type {object}
 */
export const typeList = {
    STRING: 'string',
    BLOCK: 'block',
    PAREN: 'paren',
    NUMBER: 'number',
    ARRAY: 'array',
    KEYWORD: 'keyword',
    SELF_TYPE: 'vsyc_type',
}

/**
 * @function getType
 * @description Get the type of a string
 * @param {string} str
 * @returns {string} typeName
 */
const getType = (str: any) => {
    switch (str) {
        case str.match(/[0-9]/gm):
            return typeList.NUMBER
        case str.match(/[a-zA-Z]/gm):
            return typeList.STRING
        case str.match(/[\[\]]/gm):
            return typeList.ARRAY
        case str.match(/[\(\)]/gm):
            return typeList.PAREN
        case str.match(/[\{\}]/gm):
            return typeList.BLOCK
        default:
            return typeList.SELF_TYPE
    }
}

/**
 * @function getNodeOfTypeFrom
 * @description Get the next node of a certain type past a certain index
 * @param {object} tree
 * @param {string} type
 * @param {number} start
 * @returns {object} node
 */
export const getNodeOfTypeFrom = (tree: any, type: string, start: number) => {
    for (let i = start; i < tree.length; i++) {
        if (!tree[i]) continue
        if (tree[i].type === type) {
            return tree[i]
        }
    }
}

// main
export const main = (str: string) => {
    let tree = [
        /* { type: typeList.SELF_TYPE, value: '' } */
    ]

    let state = {
        inString: false,
        inBlock: false,
        inParen: false,
        inKeyword: false,

        wasPreviouslyInBlock: false,
        wasPreviouslyInParen: false
    }

    // helper functions
    function getLastNodeOfType(type: string) {
        for (let i = tree.length - 1; i >= 0; i--) {
            if (tree[i].type === type) {
                return tree[i]
            }
        }

        return { value: '', type: '' } // sink node
    }

    function createNode(type: string, value: string) {
        tree.push({
            type: type,
            value: value,
            parenti: state.inParen || state.inBlock ?
                tree.indexOf(getLastNodeOfType(typeList[state.inBlock ? 'BLOCK' : 'PAREN'])) :
                tree.indexOf(getLastNodeOfType(typeList.SELF_TYPE))
        })
    }

    function getNodeFromParenti(parenti: number) {
        // get node with parent index
        if (tree[parenti]) return tree[parenti]
        return { value: '', type: '' } // sink node
    }

    // main loop
    for (let i = 0; i < str.length; i++) {
        const char = str[i]

        switch (char) {
            case '\n': break
            // add ";" to the last node
            // const lastNode = tree[tree.length - 1]
            // if (lastNode) lastNode.value += ';'

            case '\t': break
            case '\r': break
            case '\v': break

            // handle blocks/parens
            case '{':
                createNode(typeList.BLOCK, '')
                state.inBlock = true

                if (state.inParen) {
                    state.wasPreviouslyInParen = true
                    state.inParen = false
                }

                break

            case '}':
                state.inBlock = false
                if (state.wasPreviouslyInParen) state.inParen = true // set the paren state back
                break

            case '(':
                createNode(typeList.PAREN, '')
                state.inParen = true

                if (state.inBlock) {
                    state.wasPreviouslyInBlock = true
                    state.inBlock = false
                }

                break

            case ')':
                state.inParen = false
                if (state.wasPreviouslyInBlock) state.inBlock = true // set the block state back
                break

            // handle strings
            case '"':
                state.inString = !state.inString
                if (state.inString) createNode(typeList.STRING, '')
                break

            // handle keywords
            case '@':
                state.inKeyword = true
                if (state.inKeyword) createNode(typeList.KEYWORD, '')
                break

            // handle default operation
            default:
                // handled without use of "else" so a string can exist within a block and etc.
                // the order of statements represents their priority

                // check if in string
                if (state.inString) {
                    // get last node of type string and add char to value
                    let node = getLastNodeOfType(typeList.STRING)
                    node.value += char

                    // update the parenti of the node's value with the character as well
                    let parentNode = getNodeFromParenti(node.parenti)
                    parentNode.value += char
                    break // fixes code duplication when also in a block
                }

                // check if in keyword
                if (state.inKeyword) {
                    if (char === ' ') {
                        state.inKeyword = false
                        break
                    }

                    let node = getLastNodeOfType(typeList.KEYWORD)
                    node.value += char
                    break // keyword breaks so strings can not exist as another type when state is in a keyword
                }

                // check if in block
                if (state.inBlock) {
                    // get last node of type block and add char to value
                    let node = getLastNodeOfType(typeList.BLOCK)
                    node.value += char
                    break // breaks for same reason
                }

                // check if in paren
                if (state.inParen) {
                    // get last node of type paren and add char to value
                    let node = getLastNodeOfType(typeList.PAREN)
                    node.value += char
                    break // breaks for same reason
                }

                // if all other cases fail, add char to value of last node of type self_type
                if (char !== ' ') {
                    // add char to value of last node with SELF_TYPE
                    let node = getLastNodeOfType(typeList.SELF_TYPE)
                    node.value += char
                } else {
                    // createNode(typeList.SELF_TYPE, char)
                }

                break
        }
    }

    return tree
}

export default {
    tokenize: main,
    typeList,
    getNodeOfTypeFrom
}