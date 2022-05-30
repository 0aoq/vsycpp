/**
 * @file Handle interpreation of a tokenized string
 * @name interpreter.js
 * @author 0aoq <hkau@oxvs.net>
 * @license Apache-2.0
 */

import * as tokenizer from './tokenizer.js'
import * as keywords from './keywords.js'

import * as fs from 'fs'
import * as path from 'path'

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
export const registerAddress = (type: string, data: object, overwriteAddress?: any) => {
    const address = addressStore.length * 812

    addressStore.push({
        address: overwriteAddress || address,
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
export const getFromAddress = (address: number) => {
    for (let i = 0; i < addressStore.length; i++) {
        if (addressStore[i].address === address) {
            return addressStore[i]
        }
    }
}

// let globalTree = []
let storedTrees = {
    'root': []
}

let currentTree = {
    _map: storedTrees.root,
    name: 'root'
}

/**
 * @function replaceVariablesInTree
 * @description Replace variables in a tree with their values
 * @param {object} tree 
 */
export const replaceVariablesInTree = (tree: any = storedTrees.root) => {
    for (let address of addressStore) {
        if (address.type === tokenizer.typeList.STRING) {
            for (let i = 0; i < tree.length; i++) {
                if (!tree[i].value || !tree[i].value.replaceAll) continue
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
 * @param {object[]} globalTree
 * @param {string} treeName
 * @returns {object}
 */
export const processKeyword = (keyword: string, line: any, _address: any, allowBlockCode: boolean, globalTree: any, treeName?: string) => {
    if (globalTree._map) globalTree = globalTree._map

    // if globalTree[line.parenti] is of type 'block' return
    // make sure function code doesn't get executed until needed
    if (
        !allowBlockCode &&
        globalTree[line.parenti] && globalTree[line.parenti].type === 'block'
    ) return [globalTree, null]

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
                    return [globalTree, null]
                }

                // register the address of the variable
                const address = registerAddress(
                    tokenizer.typeList.STRING,
                    [data[0].trim(), data[1].trim()]
                )

                // update every item in the tree
                globalTree = replaceVariablesInTree(globalTree)
            }

            return [globalTree, null]

        case "print":
            // when reaching a print statement, the next object should be a string
            const toPrint = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.STRING,
                globalTree.indexOf(line)
            )

            if (toPrint) console.log(toPrint.value)
            return [globalTree, null]

        case "c":
            return [globalTree, null] // comment

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

            if (funcName && funcBody && funcParams) {
                // register the address of the function
                const address = registerAddress(
                    tokenizer.typeList.BLOCK,
                    [
                        funcName.value,
                        funcParams.value,
                        globalTree.indexOf(funcBody),
                        treeName
                    ],
                    funcName.value
                )

                // update every item in the tree
                for (let i = 0; i < globalTree.length; i++) {
                    if (globalTree[i].value.includes(`/\*${funcName.value}/gm`)) {
                        globalTree[i].address = address
                    }
                }
            } else console.error("[ERROR]: Invalid function declaration")
            return [globalTree, null]

        case "return":
            // when reaching a return statement, the next object can be anything
            // update the value of the object at the address to the
            // evaluated result of the return statement
            const statement = globalTree[globalTree.indexOf(line) + 1]
            return [globalTree, evaluateLine(statement)]

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
                const address = getFromAddress(callName.value.slice(1))
                const _return = evaluateFunction(address, callParams.value)[1]

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

                            return [globalTree, null]
                        }
                    }
                }
            } else console.error("[ERROR]: Invalid function call method")
            return [globalTree, null]

        // export and usingfile
        case "exportall":
            // will be used to export the entire file's address store
            // will be fetched by "usingfile"
            globalTree[globalTree.indexOf(line)].store = addressStore
            return [globalTree, null]

        case "usingfile":
            // when reaching a usingfile statement, the next object should be a string
            const fileName = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.STRING,
                globalTree.indexOf(line)
            )

            if (fileName) {
                // fetch the file using fs
                const file = fs.readFileSync(path.resolve(fileName.value), 'utf8')
                main(file, fileName.value)
            }

            return [globalTree, null]

        case "if":
            // when reaching an if statement, the next object should be a block
            // containing the condition, and the object after should be a block
            // containing the code to run if the condition is true
            const ifCondition = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line)
            )

            const doStatement = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.STRING,
                globalTree.indexOf(line) + 2
            )

            if (!doStatement || doStatement && doStatement.value !== 'do:') console.error("[ERROR]: Invalid if statement")
            const ifBody = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(doStatement) + 1
            )

            if (ifCondition && ifBody) {
                // evaluate the condition
                let condition
                for (let i = 0; i < globalTree.length; i++) {
                    let line = globalTree[i]

                    // make sure we're calling a comparison function
                    if (
                        line.value !== 'eq' &&
                        line.value !== 'lt' &&
                        line.value !== 'gt'
                    ) continue

                    // handle comparison functions
                    const _s = evaluateLine(line, _address, true, globalTree, treeName)
                    if (_s === undefined || _s === null) {
                        console.error("[ERROR]: 'If' condition did not return")
                        return [globalTree, null]
                    }

                    if (_s[1] !== undefined) {
                        const [_tree, _result] = _s
                        condition = _result
                    } else {
                        return [globalTree, null]
                    }
                }

                // if the condition is true, evaluate the code
                if (condition) {
                    for (let line of globalTree) {
                        if (line.parenti === globalTree.indexOf(ifBody)) evaluateLine(line, _address, true, globalTree, treeName)
                    }
                }
            } else console.error("[ERROR]: Invalid if statement")

        // lt, gt, equal
        case "lt":
            // when reaching lt, the next two objects should be blocks
            // the first block should be the left side of the comparison
            // the second block should be the right side of the comparison

            // lt only supports numbers

            const ltLeft = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line)
            )

            const ltRight = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line) + 2
            )

            if (ltLeft && ltRight) {
                // if ltLeft and ltRight can be parsed to a number, compare them
                if (parseFloat(ltLeft.value) !== undefined || parseFloat(ltRight.value) !== undefined) {
                    // if they can't be parsed to a number, compare the strings
                    if (ltLeft.value < ltRight.value) return [globalTree, true]
                    else return [globalTree, false]
                }

                return [globalTree, false]
            } else console.error("[ERROR]: Invalid lt statement")

        case "gt":
            // when reaching gt, the next two objects should be blocks
            // the first block should be the left side of the comparison
            // the second block should be the right side of the comparison

            // gt only supports numbers

            const gtLeft = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line)
            )

            const gtRight = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line) + 2
            )

            if (gtLeft && gtRight) {
                // if gtLeft and gtRight can be parsed to a number, compare them
                if (parseFloat(gtLeft.value) !== undefined || parseFloat(gtRight.value) !== undefined) {
                    // if they can't be parsed to a number, compare the strings
                    if (gtLeft.value > gtRight.value) return [globalTree, true]
                    else return [globalTree, false]
                }

                return [globalTree, false]
            } else console.error("[ERROR]: Invalid gt statement")

        case "eq":
            // when reaching equal, the next two objects should be blocks
            // the first block should be the left side of the comparison
            // the second block should be the right side of the comparison

            // equal only supports numbers and strings

            const equalLeft = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line)
            )

            const equalRight = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line) + 2
            )

            if (equalLeft && equalRight) {
                // if equalLeft and equalRight can be parsed to a number, compare them
                if (parseFloat(equalLeft.value) !== undefined && parseFloat(equalRight.value) !== undefined) {
                    // if they can't be parsed to a number, compare the strings
                    if (equalLeft.value === equalRight.value) return [globalTree, true]
                    else return [globalTree, false]
                } else {
                    // if they are not numbers, compare them as strings
                    if (equalLeft.value === equalRight.value) return [globalTree, true]
                    else return [globalTree, false]
                }
            } else console.error("[ERROR]: Invalid equal statement")

        default:
            if (!keywords.default.includes(keyword)) {
                console.warn(`[ERROR]: Unknown keyword: ${keyword}, line:\n`, line)
            }

            return [globalTree, null]
    }
}

// main

export const main = (str: string, treeName?: string) => {
    let tree = tokenizer.main(str) // tokenize
    if (treeName) storedTrees[treeName] = tree
    switchTree(treeName) // switch tree

    // process
    for (let line of tree) {
        const returned = evaluateLine(line, 0, false, tree, treeName)
        if (!returned || returned[0].length === 1) continue
        tree = returned[0]
    }

    if (treeName) storedTrees[treeName] = tree
}

/**
 * @function evaluateLine
 * @description Evaluate a line of code
 * @param {object} line
 * @param {number} address
 * @param {boolean} allowBlockCode
 * @param {object[]} tree
 * @param {string} treeName
 */
export const evaluateLine = (line: any, address: number = 0, allowBlockCode: boolean = false, tree: any = currentTree, treeName: string = 'root') => {
    switch (line.type) {
        case tokenizer.typeList.KEYWORD:
            const [_tree, _result] = processKeyword(
                line.value,
                line,
                address,
                allowBlockCode,
                tree,
                treeName
            )

            return [_tree, _result]

        case tokenizer.typeList.STRING:
            return [tree, line.value]

        default:
            return [tree, null]
    }
}

/**
 * @function switchTree
 * @description Switch the current tree to the specified tree
 * @param {string} treeName
 */
export const switchTree = (treeName: string) => {
    currentTree = {
        _map: storedTrees[treeName],
        name: treeName
    }
}

/**
 * @function evaluateFunction
 * @description Evaluate a function
 * @param {object} _address 
 * @param {string} _arguments 
 */
export const evaluateFunction = (_address: any, _arguments: any) => {
    if (!_address) {
        console.warn("[ERROR]: Invalid function address")
        return
    }

    const blockStart = _address.data[2]
    const treeName = _address.data[3] || 'root'
    let result = 'VSYC++:INVALID_RETURN'

    // switch currentTree
    switchTree(treeName)

    // evaluate
    for (let line of currentTree._map) {
        if (line.parenti === blockStart) {
            const [_tree, _result] = evaluateLine(line, _address.data[0], true, currentTree._map, currentTree.name)
            if (_result === null) continue

            currentTree._map = _tree
            storedTrees[currentTree.name] = currentTree

            result = _result
            break // after the first result, break
        }
    }

    switchTree('root') // switch tree back to root
    return result
}

export default {
    interpret: main
}