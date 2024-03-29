/**
 * @file Handle interpreation of a tokenized string
 * @name interpreter.ts
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
/**
 * @global
 * @name storedTrees
 * @description An object storing the state of all loaded file trees and their execution states
 */
export let storedTrees = {
    'root': []
}

/**
 * @global
 * @name currentTree
 * @description An object representing the current state of the current tree under storedTrees
 */
export let currentTree = {
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
                if (
                    // GLOBAL
                    tree[i].value
                    // SCOPE CHECK
                    && tree[i].parenti === address.data[2]
                    //  GLOBAL
                    || tree[i].value.replaceAll
                    // SCOPE CHECK
                    && tree[i].parenti === address.data[2] /* check if the address does not have a global scope, and then
                    //                                        if the parenti of the tree item is not the same as the scope */
                    || address.data[2] === -1
                    || tree[i - 1] && tree[i - 1].value === "return" // cheat to make return statements work properly (???)
                ) {
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
    }

    return tree
}

/**
 * @function replaceOldVariableValues
 * @description Replace old variable values with new ones
 * @param {object} tree
 * @param {string} oldData
 * @param {object} address
 */
export const replaceOldVariableValues = (tree: any = storedTrees.root, oldData: string, address: any) => {
    for (let i = 0; i < tree.length; i++) {
        if (tree[i].address === address.address) {
            tree[i].value = tree[i].value.replace(
                oldData, // old value
                address.data[1] // new value
            )
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
                    console.error("\x1b[1m\x1b[31m", `[ERROR]: "${next.value}" is not a valid variable declaration`, "\x1b[0m")
                    return [globalTree, null]
                }

                // register the address of the variable
                const address = registerAddress(
                    tokenizer.typeList.STRING,
                    [data[0].trim(), data[1].trim(), line.parenti] // name, value, parenti scope (-1: global)
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
                        funcName.value, // [0] name
                        funcParams.value, // [1] value
                        globalTree.indexOf(funcBody), // [2] code block parenti
                        treeName, // [3] treeName
                        funcParams.value.split(',').map(param => param.trim()) // [4] params
                    ],
                    funcName.value
                )

                // update every item in the tree
                for (let i = 0; i < globalTree.length; i++) {
                    if (globalTree[i].value.includes(`/\*${funcName.value}/gm`)) {
                        globalTree[i].address = address
                    }
                }
            } else console.error("\x1b[1m\x1b[31m", "[ERROR]: Invalid function declaration", "\x1b[0m")
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
                // TODO (around this line): create scoped variables for each parameter of the function
                // ALSO TODO: allow scoped functions
                let _return
                let _params = callParams.value.split(',').map(param => param.trim())

                // make sure it has EXACTLY the amount of parameters as the function has (strict)
                if (/* strictMode && */ address.data[4].length === _params.length) {
                    // for each parameter under _params, create a scoped variable with the name of the parameter under address.data[4]
                    // and set the value to the parameter
                    for (let i = 0; i < _params.length; i++) {
                        const scopedVariable = registerAddress(
                            tokenizer.typeList.STRING,
                            [
                                `${callName.value.slice(1)}.args.${address.data[4][i]}`, // name
                                _params[i], // value
                                address.data[2] // parenti
                            ]
                        )

                        globalTree = replaceVariablesInTree(globalTree)
                    }

                    // evaluate
                    _return = evaluateFunction(address)
                } else {
                    console.error("\x1b[1m\x1b[31m", `[ERROR]: Function "${callName.value}" has ${address.data[4].length} parameters, but ${_params.length} were provided`, "\x1b[0m")
                    return [globalTree, null]
                }

                // update values
                if (callVariableName) {
                    for (let address of addressStore) {
                        if (address.type === tokenizer.typeList.STRING && address.data[0] === callVariableName.value) {
                            const oldData = address.data[1]
                            address.data[1] = _return || address.data[1]

                            // update every item in the tree
                            globalTree = replaceOldVariableValues(globalTree, oldData, address)
                            return [globalTree, null]
                        }
                    }
                }
            } else console.error("\x1b[1m\x1b[31m", "[ERROR]: Invalid function call method", "\x1b[0m")
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

        // if/eq/gt/lt
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

            if (!doStatement || doStatement && doStatement.value !== 'do:') console.error("\x1b[1m\x1b[31m", "[ERROR]: Invalid if statement", "\x1b[0m")
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
                        console.error("\x1b[1m\x1b[31m", "[ERROR]: 'If' condition did not return", "\x1b[0m")
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
            } else console.error("\x1b[1m\x1b[31m", "[ERROR]: Invalid if statement", "\x1b[0m")

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
            } else console.error("\x1b[1m\x1b[31m", "[ERROR]: Invalid lt statement", "\x1b[0m")

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
            } else console.error("\x1b[1m\x1b[31m", "[ERROR]: Invalid gt statement", "\x1b[0m")

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
            } else console.error("\x1b[1m\x1b[31m", "[ERROR]: Invalid equal statement", "\x1b[0m")

        case "op":
            // an "op" statement means the opposite or something ... it's just just going to return the opposite of an "eq" statement

            const opLeft = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line)
            )

            const opRight = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line) + 2
            )

            if (opLeft && opRight) {
                line.value = "eq"
                const [_tree, _result] = processKeyword("eq", line, _address, allowBlockCode, globalTree, treeName)
                return [_tree, !_result]
            } else console.error("\x1b[1m\x1b[31m", "[ERROR]: Invalid \"opposite\" statement", "\x1b[0m")

        // arrays
        case "insert":
            // when reaching insert, the next object should be a string
            // containing the value to insert, the value after should be a block
            // containing the variable to insert into

            const insertValue = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.STRING,
                globalTree.indexOf(line)
            )

            const insertVariable = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line) + 2
            )

            if (insertValue && insertVariable) {
                // basically the same thing as the "call" function, but without the function part
                for (let address of addressStore) {
                    if (address.type === tokenizer.typeList.STRING && address.data[0] === insertVariable.value) {
                        const oldData = address.data[1]
                        const array = JSON.parse(address.data[1])
                        array.push(insertValue.value)
                        address.data[1] = JSON.stringify(array)

                        // update every item in the tree
                        globalTree = replaceOldVariableValues(globalTree, oldData, address)

                        return [globalTree, null]
                    }
                }
            }

        case "remove":
            // when reaching remove, the next object should be a string
            // containing the value to remove, the value after should be a block
            // containing the variable to remove from

            const removeValue = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.STRING,
                globalTree.indexOf(line)
            )

            const removeVariable = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line) + 2
            )

            if (removeValue && removeVariable) {
                // basically the same thing as the "call" function, but without the function part
                for (let address of addressStore) {
                    if (address.type === tokenizer.typeList.STRING && address.data[0] === removeVariable.value) {
                        const oldData = address.data[1]
                        const array = JSON.parse(address.data[1])
                        const index = array.indexOf(removeValue.value)
                        if (index !== -1) {
                            array.splice(index, 1)
                            address.data[1] = JSON.stringify(array)

                            // update every item in the tree
                            globalTree = replaceOldVariableValues(globalTree, oldData, address)
                        }
                    }
                }
            }


        // general
        case "read":
            // when reaching a read statement, the next value should be a string
            // containing the type of input to read, the value after should be a block
            // containing the input variable, the value after that should be a block
            // containing the output variable
            if (line.value !== "read") return [globalTree, false]

            const readType = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.STRING,
                globalTree.indexOf(line)
            )

            let readInput = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line) + 2
            )

            const readOutput = tokenizer.getNodeOfTypeFrom(
                // the read output might contain a comma separator, this is the index
                // of the value if we are reading an array
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line) + 3
            )

            let readOutputName = readOutput.value.split(",")[1] !== undefined ? readOutput.value.split(",")[1] : readOutput.value
            readOutputName = readOutputName.trim()

            if (readType && readInput && readOutput) {
                // basically the same thing as the "call" function, but without the function part
                for (let address of addressStore) {
                    // this is the address of our INPUT variable
                    if (address.type === tokenizer.typeList.STRING && address.data[0] === readInput.value) {
                        const input = address.data[1]

                        for (let outAddress of addressStore) {
                            // this is the address of our OUTPUT variable
                            if (outAddress.type === tokenizer.typeList.STRING && outAddress.data[0] === readOutputName) {
                                if (readType.value === 'string') {
                                    // do nothing, just return the value
                                    const output = input
                                    for (let i = 0; i < globalTree.length; i++) {
                                        if (globalTree[i].address === outAddress.address) {
                                            globalTree[i].value = output
                                        }
                                    }
                                } else if (readType.value === 'number') {
                                    // parse the value to a number
                                    const output = parseFloat(input)
                                    for (let i = 0; i < globalTree.length; i++) {
                                        if (globalTree[i].address === outAddress.address) {
                                            globalTree[i].value = output
                                        }
                                    }
                                } else if (readType.value === 'array') {
                                    // parse the value to an array
                                    const output = JSON.parse(input)

                                    // get the index of the value to read
                                    const index = parseInt(readOutput.value.split(",")[0])
                                    if (index !== undefined) {
                                        // if the index is valid, return the value at the index
                                        const output1 = output[index]
                                        for (let i = 0; i < globalTree.length; i++) {
                                            if (globalTree[i].address === outAddress.address) {
                                                globalTree[i].value = output1
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            return [globalTree, null]

        /* case "getIndex":
            // when reaching a "getIndex" statement, the next value is expected to be a string
            // contaning the value number. The next value is expected to be a block type containing
            // the array to read from
            
            const getIndex_i = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.STRING,
                globalTree.indexOf(line)
            )
            
            const getIndex_array = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line) + 2
            )
            
            if (getIndex_i && getIndex_array) {
                for (let address of addressStore) {
                    if (address.type === tokenizer.typeList.STRING && address.data[0] === getIndex_array.value) {
                        const parsed = JSON.parse(address.data[1])
                        return [globalTree, parse.indexOf(getIndex_i)]
                    }
                }
            } */

        case "execjs":
            // basic single-call keyword to execute javascript statements from wihin the program
            // could be used to create a function like document.getElementById() using actual javascript

            // when reaching an execjs statement, the next value should be a string
            // containing the javascript code to execute
            const execjs_code = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.STRING,
                globalTree.indexOf(line)
            )

            const execjs_output = tokenizer.getNodeOfTypeFrom(
                globalTree,
                tokenizer.typeList.BLOCK,
                globalTree.indexOf(line) + 2
            )

            if (execjs_code) {
                // create a new Function object with the code to run
                const res = new Function(execjs_code.value)()

                // update the value of the output variable
                for (let address of addressStore) {
                    if (address.type === tokenizer.typeList.STRING && address.data[0] === execjs_output.value) {
                        const oldData = address.data[1]
                        address.data[1] = res

                        // update every item in the tree
                        globalTree = replaceOldVariableValues(globalTree, oldData, address)
                    }
                }
            } else {
                return [globalTree, false]
            }

        default:
            if (!keywords.default.includes(keyword)) {
                console.error("\x1b[1m\x1b[31m", `[ERROR]: Unknown keyword: ${keyword}, line:\n`, line, "\x1b[0m")
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
            // this is the main part where stuff gets processed
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
 * @returns {string} Result of the function
 */
export const evaluateFunction = (_address: any) => {
    if (!_address) {
        console.error("\x1b[1m\x1b[31m", "[ERROR]: Invalid function address", "\x1b[0m")
        return
    }

    const blockStart = _address.data[2] // this is the parenti where all function code must be located
    const treeName = _address.data[3] || 'root'
    let result = 'VSYC++:INVALID_RETURN'

    // switch currentTree
    switchTree(treeName)

    // evaluate
    for (let line of currentTree._map) {
        if (
            line.parenti === blockStart
            || currentTree._map[currentTree._map.indexOf(line) + 2]
        ) {
            const [_tree, _result] = evaluateLine(line, _address.data[0], true, currentTree._map, currentTree.name)

            if (
                _result === null 
                
                || currentTree._map[currentTree._map.indexOf(line) - 1]
                && currentTree._map[currentTree._map.indexOf(line) - 1].value !== "return"

                || currentTree._map[currentTree._map.indexOf(line) + 1].address === null
            ) continue

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
