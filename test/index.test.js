// import * as tokenizer from '../vsyc/tokenizer.js'
// 
// console.log(tokenizer.main(`
// @c "This is a comment" 
// @func {test} (b, c) {
//     @declare "a = 1"
//     @print "Hello, world!"
//     
//     @return (@call "::math" (a + b + c))
// }`))

import * as interpreter from '../vsyc/interpreter.js'

interpreter.main(`
@c "This is a comment"
@print "Basic program example:"

@func {test} (b, c) {
    @declare "a = 1"
    @print "Hello, world!"
    @return "2"
}

@declare "d = 0"
@call "*test" (1, 2) {d}
@print "[#d]
`)