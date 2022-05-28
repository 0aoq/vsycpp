# vsyc++

vsyc++ is a JavaScript interpretted language that is dynamically typed and allows for user freedom in how their code is written.

## Syntax

A simple file would look similar to this:

```
@c "This is a comment" 
@func test(b, c) {
    @declare "a = 1"
    @print "Hello, world!"

    @return "[#a]"
}
```

This file shows the use of a comment, then creates a small function that declares the variable `a` and then prints the string `Hello, world!`. This function the returns the value of the defined variable `a`.

The `@` symbol is used to show the start of a command. Any characters after the symbol that are not a space are considered to be part of the command, until reaching a space. All built-in commands use the `@` symbol to denote the start of the command to allow users to name variables and functions anything they want.

### Keywords

- `@c`: Comment
- `@func`: Function
- `@declare`: Variable declaration
- `@print`: Print
- `@if`: If statement
- `@else`: Else statement
- `@elseif`: Else if statement
- `@return`: Return statement
- `@for`: For loop
- `@call`: Call a function, use `::` to call a built-in function
- `@print`: Print a message to the console

## Interpretation Example

- keyword "c" is matched:
    - Based on the syntax we know that "c" is a comment, and is expecting the very next type to be a string, this is our comment content.

```jsonc
{ type: 'keyword', value: 'c', parenti: -1 }, // this is the keyword
{ type: 'string', value: 'Func will', parenti: -1 }, // and this is the comment
```

- keyword "func" is matched:
    - Based on the syntax we know that "func" is a function, and is expecting the very next type to be a "paren" (parenthesis), these are our function parameters. 
    - We also know that the previous type is a "vsyc_type" (function name), so we can get the function name

```jsonc
{ type: 'vsyc_type', value: ' test', parenti: -1 }, // this is the function name
{ type: 'keyword', value: 'func', parenti: 2 }, // this is the function keyword
{ type: 'paren', value: 'b, c', parenti: 2 }, // and this is the function parameters
```

- keyword "call" is matched:
    - Based on the syntax we know that "call" is a function call, and is expecting the very next type to be a "string" (function name), this is our function name, if it begins with "::" then it is a built-in function, otherwise it must begin with "*" for a user-defined function. 
    - The next type is expected to be a "paren" (function parameters), these are our function parameters.

```jsonc
{ type: 'keyword', value: 'call', parenti: 6 }, // this is the function call keyword
{ type: 'string', value: '::math', parenti: 6 }, // this is the function name
{ type: 'paren', value: 'a + b + c', parenti: 6 } // and this is the function parameters
```

### Functions

Whenever a function is called that returns a value, it might need to be stored under a variable. To do this, provide a third argument to the `@call` keyword containing the variable name in block format.

```
@func {test} () {
    @return "1"
}

@declare "a = 0"
@call "*test" () {a}
@print "[#a]" @c "<-- Will print as 1 instead of 0"
```

After the function returns, the variable defined will be updated. This means when the variable is then printed in the next line, it will print as the return value ("1") instad of the normal variable value ("0").

The use of `*` and `::` is required to help the interpretter know which type of function is being called, and where to call it from. These operators help to keep the code clean and easy to understand.