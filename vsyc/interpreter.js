/**
 * @file Handle interpreation of a tokenized string
 * @name interpreter.js
 * @author 0aoq <hkau@oxvs.net>
 * @license Apache-2.0
 */

import * as tokenizer from './tokenizer.js'
import * as keywords from './keywords.js'

/**
 * @global
 * @name addressStore
 * @description Storage for addresses of variables and functions
 * @type {object}
 */
export let addressStore = []

/**
 * @function registerAddress
 * @description Register an address of a variable or function
 * @param {string} type 
 * @param {object} data
 * @returns {number} address
 */
export const registerAddress = (type, data) => {
    const address = addressStore.length * 812

    addressStore.push({
        address: address,
        type: type,
        data: data
    })

    return address
}

/**
 * @function getAddressObject
 * @description Get an address object
 * @param {number} address
 * @returns {object}
 */
export const getFromAddress = (address) => {
    for (let i = 0; i < addressStore.length; i++) {
        if (addressStore[i].address === address) {
            return addressStore[i]
        }
    }
}

let globalTree = []

/**
 * @function replaceVariablesInTree
 * @description Replace variables in a tree with their values
 * @param {object} tree 
 */
export const replaceVariablesInTree = (tree = globalTree) => {
    for (let address of addressStore) {
        if (address.type === tokenizer.typeList.STRING) {
            for (let i = 0; i < tree.length; i++) {
                if (tree[i].value.includes(`[#${address.data[0].trim()}]`)) {
                    tree[i].address = address.address
                }

                tree[i].value = tree[i].value.replaceAll(
                    `[#${address.data[0].trim()}]`,
                    (address.data[1] || "").trim()
                )
            }
        }
    }

    return tree
}

/**
 * @function processKeyword
 * @description Process the action for a keyword
 * @param {string} keyword
 * @param {object} line
 * @param {number} _address
 * @param {boolean} allowBlockCode Allow code inside blocks to run
 * @returns {object}
 */
export const processKeyword = (keyword, line, _address, allowBlockCode) => {
    // if globalTree[line.parenti] is of type 'block' return
    // make sure function code doesn't get executed until needed
    if (
        !allowBlockCode &&
        globalTree[line.parenti] && globalTree[line.parenti].type === 'block'
    ) return

    // evaluate the keyword
    switch (keyword) {
        case "declare":
            // when reaching a variable declaration, the next object should be a string
            const next = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.STRING,
                globalTree.indexOf(line)
            )

            if (next) {
                const data = next.value.split('=')
                if (!data[1]) {
                    console.warn(`[ERROR]: "${next.value}" is not a valid variable declaration`)
                    break
                }

                // register the address of the variable
                const address = registerAddress(
                    tokenizer.typeList.STRING,
                    [data[0].trim(), data[1].trim()]
                )

                // update every item in the tree
                globalTree = replaceVariablesInTree(globalTree)
            }

            break

        case "print":
            // when reaching a print statement, the next object should be a string
            const toPrint = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.STRING,
                globalTree.indexOf(line)
            )

            if (toPrint) console.log(toPrint.value)
            break

        case "c":
            break // comment

        // functions
        case "func":
            // when reaching a function declaration, the next object should be a paren
            // containing the parameters, and the previous object **could** be a block
            // containing the function name
            const funcName = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line)
            )


            const funcParams = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.PAREN,
                globalTree.indexOf(line)
            )

            const funcBody = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line) + 2
            )

            if (funcName && funcParams) {
                // register the address of the function
                const address = registerAddress(
                    tokenizer.typeList.BLOCK,
                    [funcName.value, funcParams.value, funcBody.parenti + 1]
                )

                // update every item in the tree
                for (let i = 0; i < globalTree.length; i++) {
                    globalTree[i].value = globalTree[i].value.replaceAll(
                        `*${funcName.value.trim()}`,
                        address
                    )
                }
            } else console.error("[ERROR]: Invalid function declaration")
            break

        case "return":
            // when reaching a return statement, the next object can be anything
            // update the value of the object at the address to the
            // evaluated result of the return statement
            const statement = globalTree[globalTree.indexOf(line) + 1]
            return evaluateLine(statement)

        case "call":
            // when reaching a call statement, the next object should be a string
            // and the object after should be a paren containing the parameters
            // if an object of block is found after the other two, it should
            // be used to set the specified variable to the result of the function
            const callName = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.STRING,
                globalTree.indexOf(line)
            )

            const callParams = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.PAREN,
                globalTree.indexOf(line)
            )

            const callVariableName = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line) + 2
            )

            if (callName && callParams) {
                // get the address of the function
                const address = getFromAddress(parseFloat(callName.value))
                const _return = evaluateFunction(address, callParams.value)

                // update values
                if (callVariableName) {
                    for (let address of addressStore) {
                        if (address.type === tokenizer.typeList.STRING && address.data[0] === callVariableName.value) {
                            address.data[1] = _return || address.data[1]

                            // update every item in the tree
                            for (let i = 0; i < globalTree.length; i++) {
                                if (globalTree[i].address === address.address) {
                                    globalTree[i].value = _return
                                }
                            }

                            break
                        }
                    }
                }
            } else console.error("[ERROR]: Invalid function call method")
            break

        default:
            console.warn(`[ERROR]: Unknown keyword: ${keyword}`)
            break
    }
}

// main

export const main = (str) => {
    const tree = tokenizer.main(str) // tokenize

    // process
    globalTree = tree
    for (let line of tree) evaluateLine(line)
}

/**
 * @function evaluateLine
 * @description Evaluate a line of code
 * @param {object} line 
 */
export const evaluateLine = (line, address = 0, allowBlockCode = false) => {
    switch (line.type) {
        case tokenizer.typeList.KEYWORD:
            const _eval = processKeyword(line.value, line, address, allowBlockCode)
            if (_eval !== []) return _eval
            break

        case tokenizer.typeList.STRING:
            return line.value

        default:
            break
    }
}

/**
 * @function evaluateFunction
 * @description Evaluate a function
 * @param {object} _address 
 * @param {string} _arguments 
 */
export const evaluateFunction = (_address, _arguments) => {
    const blockStart = _address.data[2]
    let result = 0

    for (let line of globalTree) {
        if (line.parenti === blockStart) result = evaluateLine(line, _address.address, true)
    }

    return result
}

export default {
    interpret: main
}