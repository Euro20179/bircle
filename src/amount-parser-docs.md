# Relscript docs

# Goals
1. operations are relative to an integer defined when the program is started
    1. that integer can be accessed through the special variable called: `rel!`
1. all operations are expressions with return values

# Grammar

literal: "all" | "all!" | "infinity" //these are all identifiers

special-literal: IDENT //provided at runtime can be mapped to any function that returns a number

function: IDENT "(" statement(","statement)* ")"

var-access: (IDENT)+

atom: number | function | literal | special-literal | string | var-access

right-unary-op: % | # | "k" | "m" | "b" | "t"
left-unary-op: # | -

factor: atom | LPAREN multi-statement RPAREN

mutate-expr: factor
           : (left-unary-op)* mutate-expr (right-unary-op)*

higher-order-term: mutate-expr ((POW) mutate-expr)*

term: higher-order-term ((MUL | DIV) higher-order-term)*

arithmetic: term ((PLUS| MINUS) term)*

root: arithmetic ((ROOT) arithmetic)*

var-assign: KEYWORD:"var" ((IDENT)+ "=" comp | IDENT LPAREN ((IDNET ("," IDENT)*)*) RPAREN "=" code KEYWORD:"rav")

var-inplace-assign (IDENT)+ ASSIGNOP comp

expr: root

pipe: expr ("|" expr)*

comp: pipe ((GE | GT | LE | LT | EQ) pipe)?

if-statement: KEYWORD:"if" comp KEYWORD:"then" multi-statement (KEYWORD:"elif" comp KEYWORD:"then" multi-statement)* (KEYWORD:"else" multi-statement)? KEYWORD:"fi"

while-loop: KEYWORD:"while" comp KEYWORD:"then" multi-statement KEYWORD:"done"

set-rel: KEYWORD:"setrel" comp

statement: comp | var-assign | if-statement | var-inplace-assign | set-rel | while-loop

multi-statement: statement (SEMI statement)* SEMI?

program: multi-statement

# Basic operators

* `;`
    * ends an expression
* `#`
    * prefix version: takes the closest higher number to `rel!` that is divisible by the number 
    following `#` and subtracts the 2
    * suffix version: takes the closest lower number to `rel!` taht is divisible by the number 
    preceeded by `#` and subtracts the 2
* `%`
    * takes the number preceeded by `%` and gets that percentage of `rel!`
* `K/M/B/T`
    * takes the number preceeded by one of these chars
    * `K` multiplies by 1000
    * `M` multiplies by 1000000
    * `B` multiplies by 1000000000
    * `T` multiplies by 1000000000000
* `|`
    * pipes the result of one expression into another, sets the `!` variable to the value of the
    previous expression

# Creating variables

`var NAME = VALUE`

The variable creation expression returns the value of the variable

# Creating functions

`var NAME(args...) = stuff rav`

The last value in the function is the return value

The function creation expression itself returns it's own function

# If statements

```relscript
if condition then
    stuff
[elif
    stuff
[else
    stuff
]]
fi
```

The last value in the if statement is the return value
