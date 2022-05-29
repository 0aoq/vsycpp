/**
 * @file Handle interpretation of whole files and their contents
 * @name index.js
 * @author 0aoq <hkau@oxvs.net>
 * @license Apache-2.0
 */

import * as interpreter from './interpreter.js'
import * as fs from 'fs'

// get first argument passed from command line
const file = process.argv[2];

// read file
(() => {
    if (!file) {
        console.log('No file specified!')
        process.exit()
    } else if (!file.endsWith('vscc')) {
        console.log('File must be a .vscc file!')
        process.exit()
    }

    const fileContents = fs.readFileSync(file, 'utf8')
    interpreter.main(fileContents, 'root')
})();