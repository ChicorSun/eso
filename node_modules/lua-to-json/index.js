'use strict'
var assert = require('assert')
var fs = require('fs')
var luaParser = require('luaparse')

module.exports = function (lua) {
  return luaEval(luaParser.parse(lua))
}

function luaEval (ast, parentTable) {
  if (ast.type === 'Chunk') {
    var table = {}
    ast.body.forEach(function (chunk) {
      luaEval(chunk, table)
    })
    return table
  } else if (ast.type === 'AssignmentStatement') {
    assert(parentTable, "Can't have an assignment statement without a place to put it")
    for (var ii = 0; ii < ast.variables.length; ++ii) {
      var varInfo = ast.variables[ii]
      if (varInfo.type !== 'Identifier') {
        console.log('Unknown variable type:', varInfo)
        process.exit(1)
      }
      parentTable[varInfo.name] = luaEval(ast.init[ii])
    }
    return parentTable
  } else if (ast.type === 'TableConstructorExpression') {
    var table = {}
    ast.fields.forEach(function (chunk) {
      luaEval(chunk, table)
    })
    return table
  } else if (ast.type === 'TableKey') {
    assert(parentTable, "Can't have a table key without a table to put it in")
    parentTable[luaEval(ast.key)] = luaEval(ast.value)
    return parentTable
  } else if (ast.type === 'TableKeyString') {
    assert(parentTable, "Can't have a table key without a table to put it in")
    parentTable[ast.key.name] = luaEval(ast.value)
    return parentTable
  } else if (ast.type === 'TableValue') {
    assert(parentTable, "Can't have a table value without a table to put it in")
    var value = luaEval(ast.value)
    if (Array.isArray(parentTable)) {
      parentTable.push(value)
    } else {
      var keys = Object.keys(parentTable)
      var maxKey = 0
      for (var i = 0; i < keys.length; i++) {
        var num = parseInt(keys[i])
        if (!isNaN(num) && num > maxKey) maxKey = num
      }
      parentTable[maxKey + 1] = value
    }
    return parentTable
  } else if (ast.type === 'UnaryExpression') {
    // 支持一元表达式：-1, not x, #table 等
    var arg = luaEval(ast.argument)
    switch (ast.operator) {
      case '-': return -arg
      case 'not': return !arg
      case '#': 
        if (Array.isArray(arg)) return arg.length
        if (typeof arg === 'string') return arg.length
        if (typeof arg === 'object' && arg !== null) return Object.keys(arg).length
        return 0
      case '~': return ~arg
      default:
        console.log('Unknown unary operator:', ast.operator)
        return arg
    }
  } else if (ast.type === 'BinaryExpression') {
    // 支持二元表达式：1+2, 3*4 等
    var left = luaEval(ast.left)
    var right = luaEval(ast.right)
    switch (ast.operator) {
      case '+': return left + right
      case '-': return left - right
      case '*': return left * right
      case '/': return left / right
      case '%': return left % right
      case '^': return Math.pow(left, right)
      case '..': return String(left) + String(right)
      case '==': return left == right
      case '~=': return left != right
      case '<': return left < right
      case '<=': return left <= right
      case '>': return left > right
      case '>=': return left >= right
      case 'and': return left && right
      case 'or': return left || right
      default:
        console.log('Unknown binary operator:', ast.operator)
        return left
    }
  } else if (ast.type === 'Identifier') {
    // 返回标识符名称（用于某些上下文）
    return ast.name
  } else if (ast.type === 'IndexExpression') {
    // 支持索引表达式：table[key]
    var base = luaEval(ast.base)
    var index = luaEval(ast.index)
    if (base && typeof base === 'object') {
      return base[index]
    }
    return undefined
  } else if (ast.type === 'MemberExpression') {
    // 支持成员表达式：table.field
    var base = luaEval(ast.base)
    var identifier = ast.identifier.name
    if (base && typeof base === 'object') {
      return base[identifier]
    }
    return undefined
  } else if (ast.type === 'CallExpression') {
    // 函数调用 - 返回空对象避免崩溃
    console.log('Warning: Function call ignored:', ast.base.name || 'anonymous')
    return {}
  } else if (ast.type === 'StringCallExpression') {
    // 字符串调用 - 返回空对象
    return {}
  } else if (ast.type === 'TableCallExpression') {
    // 表调用 - 返回空对象
    return {}
  } else if (ast.type === 'NilLiteral') {
    return null
  } else if (ast.type === 'BooleanLiteral') {
    return ast.value
  } else if (/Literal$/.test(ast.type)) {
    return ast.value
  } else {
    console.log('Unknown type:', ast)
    // 不直接退出，返回空对象避免崩溃
    return {}
  }
}
