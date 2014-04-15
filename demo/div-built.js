(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * The buffer module from node.js, for the browser.
 *
 * Author:   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * License:  MIT
 *
 * `npm install buffer`
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++)
      target[i + target_start] = this[i + start]
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":2,"ieee754":3}],2:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var ZERO   = '0'.charCodeAt(0)
	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	module.exports.toByteArray = b64ToByteArray
	module.exports.fromByteArray = uint8ToBase64
}())

},{}],3:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],4:[function(require,module,exports){
// Generated by CoffeeScript 1.7.1
(function() {
  var graph, resample, xAxis, yAxis;

  resample = require('./resample');

  graph = new Rickshaw.Graph({
    element: document.querySelector("#chart"),
    width: 1200,
    height: 400,
    renderer: 'line',
    min: -300,
    max: 500,
    series: [
      {
        data: require('./id.json'),
        color: 'red'
      }, {
        data: require('./zeropad.json'),
        color: 'green'
      }, {
        data: require('./interpolate.json'),
        color: 'blue'
      }
    ]
  });

  xAxis = new Rickshaw.Graph.Axis.X({
    graph: graph
  });

  yAxis = new Rickshaw.Graph.Axis.Y({
    graph: graph
  });

  graph.render();

}).call(this);

},{"./id.json":5,"./interpolate.json":6,"./resample":7,"./zeropad.json":8}],5:[function(require,module,exports){
module.exports=[{"x":0,"y":0},{"x":34,"y":383.95918367346934},{"x":285,"y":550.9183673469388},{"x":789,"y":464.87755102040813},{"x":1042,"y":577.5918367346937},{"x":1545,"y":492.55102040816325},{"x":1797,"y":658.5102040816327},{"x":2301,"y":572.4693877551019},{"x":2804,"y":461.30612244897935},{"x":3056,"y":627.2653061224488},{"x":3559,"y":542.2244897959184},{"x":4062,"y":457.1836734693875},{"x":4313,"y":598.0204081632648},{"x":4816,"y":512.9795918367346},{"x":5068,"y":678.9387755102036},{"x":5571,"y":593.8979591836733},{"x":6075,"y":455.61224489795916},{"x":6326,"y":622.5714285714278},{"x":6830,"y":536.530612244898},{"x":7082,"y":702.489795918367},{"x":7586,"y":590.3265306122441},{"x":8089,"y":505.28571428571377},{"x":8341,"y":671.2448979591828},{"x":8845,"y":585.204081632653},{"x":9347,"y":475.0408163265303},{"x":9598,"y":642.0000000000002},{"x":10100,"y":557.9591836734694},{"x":10604,"y":471.9183673469382},{"x":10855,"y":612.7551020408163},{"x":11358,"y":527.714285714286},{"x":11611,"y":692.6734693877543},{"x":12115,"y":606.6326530612245},{"x":12619,"y":468.34693877550967},{"x":12871,"y":634.3061224489801},{"x":13373,"y":550.2653061224479},{"x":13876,"y":465.2244897959189},{"x":14127,"y":606.0612244897943},{"x":14629,"y":522.0204081632647},{"x":14881,"y":687.9795918367352},{"x":15383,"y":603.938775510203},{"x":15886,"y":492.77551020408214},{"x":16137,"y":659.7346938775494},{"x":16640,"y":574.6938775510204},{"x":17142,"y":490.65306122448817},{"x":17394,"y":604.367346938775},{"x":17897,"y":519.3265306122433},{"x":18149,"y":685.2857142857138},{"x":18651,"y":601.2448979591842},{"x":19154,"y":490.0816326530607},{"x":19405,"y":657.0408163265306},{"x":19908,"y":571.999999999999},{"x":20410,"y":487.9591836734694},{"x":20661,"y":628.7959183673474},{"x":21162,"y":545.7551020408147},{"x":21665,"y":460.7142857142857},{"x":21917,"y":626.6734693877535},{"x":22420,"y":515.5102040816327},{"x":22672,"y":681.4693877551005},{"x":23175,"y":596.4285714285714},{"x":23677,"y":512.3877551020393},{"x":23929,"y":626.1020408163233},{"x":24432,"y":541.0612244897969},{"x":24935,"y":456.0204081632653},{"x":25187,"y":621.9795918367357},{"x":25689,"y":511.81632653060905},{"x":25941,"y":677.7755102040795},{"x":26443,"y":593.73469387755},{"x":26945,"y":509.69387755102036},{"x":27197,"y":649.530612244899},{"x":27698,"y":566.4897959183663},{"x":28200,"y":482.44897959183675},{"x":28452,"y":648.4081632653072},{"x":28954,"y":512.1224489795886},{"x":29206,"y":678.081632653059},{"x":29709,"y":593.0408163265274},{"x":30211,"y":508.9999999999979},{"x":30463,"y":648.8367346938765},{"x":30964,"y":565.7959183673438},{"x":31466,"y":481.7551020408142},{"x":31718,"y":647.7142857142846},{"x":32220,"y":537.5510204081633},{"x":32471,"y":704.5102040816305},{"x":32973,"y":620.4693877551009},{"x":33475,"y":536.4285714285714},{"x":33727,"y":676.26530612245},{"x":34229,"y":592.2244897959151},{"x":34730,"y":509.1836734693877},{"x":34982,"y":675.1428571428581},{"x":35484,"y":538.8571428571397},{"x":35736,"y":704.8163265306101},{"x":36239,"y":619.7755102040785},{"x":36741,"y":535.7346938775489},{"x":36993,"y":675.5714285714275},{"x":37496,"y":590.5306122448958},{"x":37997,"y":507.4897959183684},{"x":38249,"y":673.4489795918336},{"x":38751,"y":563.2857142857122},{"x":39253,"y":479.2448979591826},{"x":39504,"y":646.2040816326498},{"x":40006,"y":562.1632653061204},{"x":40509,"y":450.9999999999968},{"x":40759,"y":618.9591836734662},{"x":41262,"y":533.9183673469398},{"x":41514,"y":699.877551020405},{"x":42017,"y":562.5918367346949},{"x":42519,"y":478.55102040816007},{"x":42770,"y":645.5102040816327},{"x":43274,"y":559.4693877550989},{"x":43525,"y":700.3061224489795},{"x":44028,"y":615.2653061224479},{"x":44531,"y":530.2244897959163},{"x":44783,"y":696.1836734693867},{"x":45286,"y":585.0204081632631},{"x":45789,"y":499.9795918367315},{"x":46042,"y":664.9387755102051},{"x":46544,"y":580.8979591836703},{"x":46796,"y":694.612244897957},{"x":47299,"y":609.5714285714254},{"x":47801,"y":525.5306122448958},{"x":48053,"y":691.489795918361},{"x":48557,"y":579.3265306122406},{"x":49059,"y":495.2857142857164},{"x":49309,"y":663.2448979591858},{"x":49811,"y":579.204081632651},{"x":50313,"y":469.04081632652424},{"x":50565,"y":635},{"x":51066,"y":551.9591836734672},{"x":51568,"y":467.9183673469324},{"x":51819,"y":608.7551020408184},{"x":52322,"y":523.7142857142815},{"x":52573,"y":690.6734693877487},{"x":53077,"y":604.6326530612203},{"x":53582,"y":465.346938775506},{"x":53834,"y":631.3061224489817},{"x":54336,"y":547.2653061224469},{"x":54839,"y":462.2244897959205},{"x":55090,"y":603.0612244897959},{"x":55592,"y":519.0204081632611},{"x":55844,"y":684.9795918367367},{"x":56346,"y":600.9387755102019},{"x":56848,"y":490.77551020407526},{"x":57100,"y":656.734693877551},{"x":57602,"y":572.6938775510162},{"x":58104,"y":488.65306122449186},{"x":58356,"y":602.3673469387734},{"x":58859,"y":517.326530612247},{"x":59110,"y":684.2857142857142},{"x":59612,"y":600.2448979591794},{"x":60115,"y":489.0816326530612},{"x":60366,"y":656.0408163265284},{"x":60868,"y":571.9999999999936},{"x":61372,"y":485.95918367346513},{"x":61623,"y":626.7959183673406},{"x":62125,"y":542.7551020408163},{"x":62376,"y":709.7142857142836},{"x":62880,"y":623.6734693877551},{"x":63382,"y":513.5102040816284},{"x":63634,"y":679.4693877551041},{"x":64136,"y":595.4285714285693},{"x":64639,"y":510.3877551020429},{"x":64891,"y":624.1020408163243},{"x":65393,"y":540.0612244897895},{"x":65895,"y":456.0204081632653},{"x":66147,"y":621.9795918367305},{"x":66650,"y":510.81632653061223},{"x":66903,"y":675.7755102040753},{"x":67404,"y":592.7346938775531},{"x":67906,"y":508.69387755101826},{"x":68157,"y":649.5306122448937},{"x":68660,"y":564.4897959183673},{"x":69163,"y":479.4489795918304},{"x":69415,"y":645.4081632653061},{"x":69918,"y":508.1224489795855},{"x":70170,"y":674.0816326530612},{"x":70673,"y":589.0408163265242},{"x":71174,"y":506.0000000000021},{"x":71425,"y":646.8367346938775},{"x":71928,"y":561.7959183673406},{"x":72431,"y":476.7551020408142},{"x":72683,"y":642.7142857142794},{"x":73186,"y":531.5510204081611},{"x":73438,"y":697.5102040816263},{"x":73941,"y":612.4693877550999},{"x":74443,"y":528.4285714285651},{"x":74696,"y":667.2653061224469},{"x":75198,"y":583.2244897959121},{"x":75701,"y":498.1836734693856},{"x":75953,"y":664.1428571428507},{"x":76456,"y":526.8571428571407},{"x":76707,"y":693.816326530608},{"x":77208,"y":610.7755102040753},{"x":77710,"y":526.734693877551},{"x":77963,"y":665.5714285714222},{"x":78467,"y":579.5306122448937},{"x":78969,"y":495.48979591836945},{"x":79220,"y":662.4489795918367},{"x":79724,"y":550.2857142857164},{"x":80227,"y":465.2448979591794},{"x":80479,"y":631.2040816326552},{"x":80981,"y":547.1632653061204},{"x":81233,"y":686.9999999999936},{"x":81736,"y":601.9591836734672},{"x":82239,"y":516.9183673469408},{"x":82491,"y":682.877551020406},{"x":82993,"y":546.5918367346875},{"x":83499,"y":458.55102040816536},{"x":83752,"y":623.5102040816284},{"x":84254,"y":539.4693877551041},{"x":84506,"y":679.3061224489775},{"x":85010,"y":593.2653061224489},{"x":85513,"y":508.224489795912},{"x":85765,"y":674.1836734693877},{"x":86268,"y":563.0204081632589},{"x":86770,"y":478.9795918367347},{"x":87023,"y":643.9387755101977},{"x":87525,"y":559.8979591836735},{"x":87777,"y":673.612244897955},{"x":88280,"y":588.5714285714286},{"x":88782,"y":504.53061224489375},{"x":89034,"y":670.4897959183694},{"x":89538,"y":558.3265306122386},{"x":90041,"y":473.2857142857122},{"x":90293,"y":639.2448979591774},{"x":90796,"y":554.204081632651},{"x":91048,"y":694.0408163265242},{"x":91551,"y":608.9999999999978},{"x":92053,"y":524.959183673463},{"x":92305,"y":690.9183673469388},{"x":92809,"y":578.7551020408184},{"x":93311,"y":494.71428571428356},{"x":93563,"y":660.6734693877487},{"x":94066,"y":575.6326530612224},{"x":94317,"y":690.3469387755059},{"x":94820,"y":605.3061224489795},{"x":95322,"y":521.2653061224447},{"x":95575,"y":686.2244897959183},{"x":96078,"y":575.0612244898001},{"x":96581,"y":490.0204081632526},{"x":96833,"y":655.9795918367389},{"x":97336,"y":570.9387755101914},{"x":97587,"y":711.7755102040774},{"x":98089,"y":627.7346938775426},{"x":98593,"y":541.6938775510246},{"x":98845,"y":707.6530612244898},{"x":99348,"y":570.3673469387797},{"x":99850,"y":486.3265306122449},{"x":100103,"y":651.2857142857185},{"x":100606,"y":566.244897959171},{"x":101108,"y":456.0816326530654},{"x":101360,"y":622.0408163265306},{"x":101864,"y":535.9999999999916},{"x":102115,"y":702.9591836734694},{"x":102617,"y":592.7959183673427},{"x":103119,"y":508.75510204080786},{"x":103371,"y":674.714285714273},{"x":103876,"y":587.6734693877424},{"x":104378,"y":477.51020408163686},{"x":104631,"y":642.4693877550893},{"x":105133,"y":558.4285714285757},{"x":105636,"y":473.3877551020281},{"x":105888,"y":587.1020408163307},{"x":106391,"y":502.0612244897832},{"x":106643,"y":668.0204081632695},{"x":107146,"y":582.979591836722},{"x":107648,"y":472.81632653061644},{"x":107899,"y":639.7755102040732},{"x":108400,"y":556.734693877551},{"x":108903,"y":471.6938775510246},{"x":109155,"y":611.530612244898},{"x":109657,"y":527.4897959183631},{"x":109908,"y":694.448979591841},{"x":110412,"y":608.4081632653018},{"x":110915,"y":471.1224489795918},{"x":111167,"y":637.081632653057},{"x":111669,"y":553.0408163265222}]
},{}],6:[function(require,module,exports){
module.exports=[{"x":0,"y":0},{"x":37,"y":380.95918367346934},{"x":553,"y":282.9183673469388},{"x":1316,"y":-62.1224489795918},{"x":1570,"y":49.59183673469388},{"x":2077,"y":-39.44897959183667},{"x":2588,"y":-132.4897959183674},{"x":2844,"y":29.46938775510184},{"x":3101,"y":164.30612244897947},{"x":3860,"y":-176.73469387755102},{"x":4116,"y":-14.775510204081764},{"x":4367,"y":152.1836734693875},{"x":4877,"y":34.02040816326504},{"x":5385,"y":-56.0204081632653},{"x":5891,"y":-144.06122448979605},{"x":6144,"y":20.897959183672942},{"x":6400,"y":130.6122448979592},{"x":6909,"y":39.571428571428044},{"x":7419,"y":-52.46938775510257},{"x":7927,"y":-142.5102040816329},{"x":8182,"y":-5.6734693877553655},{"x":8434,"y":160.28571428571377},{"x":9195,"y":-182.75510204081633},{"x":9200,"y":230.20408163265304},{"x":9961,"y":-138.95918367347016},{"x":10217,"y":22.999999999999734},{"x":10726,"y":-68.0408163265314},{"x":10983,"y":92.91836734693904},{"x":11491,"y":-23.244897959184463},{"x":11999,"y":-113.2857142857148},{"x":12254,"y":49.67346938775457},{"x":12763,"y":-41.36734693877656},{"x":13019,"y":68.34693877550967},{"x":13528,"y":-22.693877551021462},{"x":13783,"y":140.26530612244792},{"x":14293,"y":48.22448979591731},{"x":14801,"y":-67.93877551020356},{"x":15309,"y":-157.9795918367352},{"x":15564,"y":4.979591836734166},{"x":15816,"y":170.9387755102046},{"x":16327,"y":51.77551020408005},{"x":16835,"y":-38.265306122448976},{"x":17343,"y":-128.30612244898063},{"x":17599,"y":33.653061224489264},{"x":17859,"y":139.36734693877497},{"x":18621,"y":-204.67346938775458},{"x":18876,"y":-41.71428571428518},{"x":19130,"y":122.24489795918367},{"x":19640,"y":4.081632653061225},{"x":20143,"y":-80.95918367347043},{"x":20397,"y":82.99999999999841},{"x":20906,"y":-8.040816326530084},{"x":21409,"y":-119.20408163265358},{"x":21664,"y":43.7551020408158},{"x":22171,"y":-45.28571428571376},{"x":22429,"y":114.67346938775457},{"x":22937,"y":-1.4897959183689309},{"x":23443,"y":-89.53061224489902},{"x":23700,"y":71.42857142857143},{"x":24209,"y":-19.612244897962352},{"x":24461,"y":94.10204081632442},{"x":24970,"y":3.061224489795918},{"x":25472,"y":-80.97959183673363},{"x":25728,"y":80.97959183673363},{"x":26236,"y":-35.183673469389866},{"x":26743,"y":-124.22448979591942},{"x":26997,"y":39.734693877552075},{"x":27504,"y":-49.306122448982755},{"x":27760,"y":86.53061224489795},{"x":28269,"y":-4.510204081635821},{"x":28772,"y":-89.5510204081622},{"x":29028,"y":72.40816326530506},{"x":29535,"y":-68.87755102040816},{"x":29791,"y":93.0816326530591},{"x":30300,"y":2.0408163265306123},{"x":30803,"y":-83.00000000000105},{"x":31059,"y":52.836734693874384},{"x":31568,"y":-38.204081632654116},{"x":31825,"y":122.75510204081633},{"x":32336,"y":29.7142857142836},{"x":32843,"y":-85.44897959183778},{"x":33101,"y":74.51020408163053},{"x":33610,"y":-16.53061224489796},{"x":34112,"y":-100.57142857142752},{"x":34367,"y":36.265306122450035},{"x":34874,"y":-52.775510204084796},{"x":35131,"y":108.18367346938564},{"x":35641,"y":16.142857142855032},{"x":36145,"y":-122.14285714285714},{"x":36398,"y":42.816326530611185},{"x":36907,"y":-48.22448979591731},{"x":37163,"y":113.73469387754996},{"x":37673,"y":-4.428571428572484},{"x":38175,"y":-88.46938775510203},{"x":38429,"y":75.48979591836418},{"x":38939,"y":-16.551020408166433},{"x":39444,"y":-129.71428571428888},{"x":39700,"y":32.244897959183675},{"x":40206,"y":-55.795918367349046},{"x":40463,"y":105.16326530612139},{"x":40974,"y":-14.000000000003167},{"x":41477,"y":-99.04081632652955},{"x":41733,"y":62.918367346937714},{"x":42242,"y":-28.12244897959078},{"x":42498,"y":81.59183673469282},{"x":43008,"y":-10.44897959183779},{"x":43510,"y":-94.48979591836735},{"x":43766,"y":67.46938775509993},{"x":44276,"y":-50.69387755102252},{"x":44531,"y":112.26530612244686},{"x":45041,"y":20.224489795916256},{"x":45550,"y":-70.81632653061224},{"x":45807,"y":64.02040816326635},{"x":46314,"y":-25.020408163268474},{"x":46822,"y":-115.06122448979485},{"x":47078,"y":46.89795918367241},{"x":47335,"y":155.6122448979592},{"x":48096,"y":-187.42857142857355},{"x":48349,"y":-22.469387755099927},{"x":48606,"y":138.48979591836522},{"x":49116,"y":20.326530612242784},{"x":49623,"y":-68.71428571429205},{"x":49879,"y":93.24489795918578},{"x":50386,"y":4.204081632650949},{"x":50889,"y":-106.95918367346727},{"x":51144,"y":56.00000000000211},{"x":51653,"y":-35.04081632653695},{"x":52161,"y":-125.08163265306334},{"x":52417,"y":10.755102040812103},{"x":52669,"y":176.71428571428783},{"x":53431,"y":-167.326530612247},{"x":53686,"y":-4.367346938777622},{"x":53939,"y":108.34693877551231},{"x":54447,"y":18.30612244897537},{"x":54948,"y":-64.73469387755735},{"x":55204,"y":97.22448979592048},{"x":55711,"y":-17.93877551020619},{"x":56214,"y":-102.97959183673258},{"x":56468,"y":60.97959183672835},{"x":56980,"y":-33.06122448979592},{"x":57236,"y":102.77551020407952},{"x":57744,"y":12.734693877553132},{"x":58246,"y":-71.3061224489817},{"x":58501,"y":91.65306122448769},{"x":59009,"y":-50.63265306122238},{"x":59515,"y":-138.6734693877551},{"x":59770,"y":24.285714285714285},{"x":60026,"y":186.24489795918154},{"x":60785,"y":-180.91836734693877},{"x":61039,"y":-16.959183673467276},{"x":61290,"y":150},{"x":61799,"y":58.9591836734715},{"x":62305,"y":-55.20408163265306},{"x":62810,"y":-142.24489795918367},{"x":63063,"y":22.714285714279377},{"x":63569,"y":-65.32653061224278},{"x":63823,"y":72.51020408162631},{"x":64329,"y":-15.530612244895847},{"x":64580,"y":151.42857142857142},{"x":65338,"y":-188.61224489796552},{"x":65341,"y":174.1020408163244},{"x":66098,"y":-164.9387755102104},{"x":66351,"y":0.02040816326319428},{"x":66602,"y":166.97959183673046},{"x":67361,"y":-200.18367346938987},{"x":67363,"y":215.7755102040753},{"x":68121,"y":-124.2653061224511},{"x":68374,"y":40.69387755102252},{"x":68879,"y":-72.46938775509993},{"x":69134,"y":90.48979591836945},{"x":69641,"y":1.4489795918346229},{"x":70143,"y":-82.59183673470021},{"x":70396,"y":30.122448979589723},{"x":70904,"y":-59.91836734693666},{"x":71159,"y":103.04081632653272},{"x":71666,"y":13.999999999997888},{"x":72168,"y":-96.16326530612878},{"x":72425,"y":64.79591836734694},{"x":72932,"y":-24.244897959187895},{"x":73189,"y":136.71428571428783},{"x":73947,"y":-229.44897959184095},{"x":73951,"y":184.51020408163055},{"x":74711,"y":-157.53061224490006},{"x":74966,"y":5.428571428569317},{"x":75219,"y":144.26530612245108},{"x":75728,"y":53.22448979591203},{"x":76236,"y":-36.816326530614354},{"x":76741,"y":-123.85714285714496},{"x":76996,"y":-13.142857142859254},{"x":77248,"y":152.8163265306059},{"x":78007,"y":-188.22448979592258},{"x":78261,"y":-24.26530612245109},{"x":78515,"y":113.57142857142857},{"x":79023,"y":23.53061224489162},{"x":79531,"y":-66.51020408163477},{"x":79785,"y":97.44897959183673},{"x":80291,"y":-16.714285714287826},{"x":80795,"y":-102.75510204081633},{"x":81050,"y":60.20408163265306},{"x":81558,"y":-29.836734693883887},{"x":81815,"y":105},{"x":82324,"y":13.959183673471498},{"x":82825,"y":-69.08163265306122},{"x":83081,"y":92.87755102040605},{"x":83589,"y":-49.40816326530401},{"x":84096,"y":-138.44897959183885},{"x":84351,"y":24.51020408163054},{"x":84858,"y":-64.53061224490429},{"x":85115,"y":70.3061224489796},{"x":85622,"y":-18.734693877555245},{"x":85873,"y":148.22448979591204},{"x":86632,"y":-192.81632653061646},{"x":86635,"y":196.0204081632653},{"x":87392,"y":-143.02040816326954},{"x":87648,"y":18.938775510197747},{"x":88149,"y":-64.10204081632442},{"x":88404,"y":46.6122448979613},{"x":88913,"y":-44.42857142857776},{"x":89167,"y":119.53061224489373},{"x":89675,"y":29.489795918367346},{"x":90181,"y":-84.67346938775721},{"x":90436,"y":78.28571428571217},{"x":90945,"y":-12.755102040816325},{"x":91448,"y":-97.79591836735327},{"x":91703,"y":39.04081632652427},{"x":92211,"y":-51.00000000000211},{"x":92466,"y":111.95918367346727},{"x":92974,"y":21.918367346940887},{"x":93480,"y":-92.24489795918367},{"x":93736,"y":69.7142857142836},{"x":94244,"y":-20.326530612242784},{"x":94751,"y":-109.36734693877762},{"x":95006,"y":1.3469387755080922},{"x":95258,"y":167.3061224489838},{"x":96019,"y":-175.73469387755947},{"x":96274,"y":-12.775510204090079},{"x":96526,"y":127.06122448978324},{"x":97035,"y":36.0204081632653},{"x":97544,"y":-55.02040816327375},{"x":97800,"y":106.93877551020408},{"x":98310,"y":-11.224489795918368},{"x":98813,"y":-96.26530612244476},{"x":99068,"y":66.69387755102463},{"x":99578,"y":-25.34693877550598},{"x":100086,"y":-167.63265306123716},{"x":100341,"y":-4.673469387767773},{"x":100593,"y":161.2857142857185},{"x":101356,"y":-183.755102040829},{"x":101361,"y":203.08163265304856},{"x":102120,"y":-137.9591836734694},{"x":102376,"y":23.999999999987327},{"x":102881,"y":-63.04081632654328},{"x":103135,"y":74.79591836734694},{"x":103644,"y":-16.24489795919212},{"x":104146,"y":-100.28571428572695},{"x":104401,"y":62.67346938774243},{"x":104910,"y":-54.48979591836734},{"x":105165,"y":108.46938775510203},{"x":105676,"y":15.428571428558756},{"x":106178,"y":-68.61224489795495},{"x":106434,"y":41.10204081631808},{"x":106943,"y":-49.938775510199854},{"x":107200,"y":111.0204081632653},{"x":107710,"y":18.979591836734695},{"x":108212,"y":-91.18367346939198},{"x":108468,"y":70.77551020408585},{"x":108975,"y":-18.26530612244898},{"x":109478,"y":-103.30612244897536},{"x":109733,"y":33.53061224490218},{"x":110240,"y":-55.51020408163265},{"x":110495,"y":107.44897959183673},{"x":111003,"y":17.408163265310346},{"x":111254,"y":132.1224489795834},{"x":112012,"y":-207.918367346943},{"x":112016,"y":206.04081632651793}]
},{}],7:[function(require,module,exports){
(function (Buffer){
// Generated by CoffeeScript 1.7.1
(function() {
  module.exports.id = function(chunk, newLength, CHANNELS) {
    return chunk;
  };

  module.exports.zeropad = function(chunk, newLength, CHANNELS) {
    var correctedChunk;
    correctedChunk = new Buffer(newLength);
    correctedChunk.fill(0);
    chunk.copy(correctedChunk);
    return correctedChunk;
  };

  module.exports.interpolate = function(chunk, newLength, CHANNELS) {
    var FRAME_SIZE, SAMPLE_SIZE, c, chunkLength, i, interpolated, k, m, mu, n, newChunk, t, xNext, xPrev, z, _i, _j;
    if (newLength <= 0) {
      return new Buffer(0);
    }
    SAMPLE_SIZE = 2;
    FRAME_SIZE = SAMPLE_SIZE * CHANNELS;
    chunkLength = chunk.length;
    n = chunkLength / FRAME_SIZE - 1;
    m = newLength / FRAME_SIZE - 1;
    newChunk = new Buffer(newLength);
    z = 0;
    for (i = _i = 0; 0 <= m ? _i < m : _i > m; i = 0 <= m ? ++_i : --_i) {
      t = i / m;
      k = t * n | 0;
      mu = t * n - k;
      for (c = _j = 0; 0 <= CHANNELS ? _j < CHANNELS : _j > CHANNELS; c = 0 <= CHANNELS ? ++_j : --_j) {
        xPrev = chunk.readInt16LE(k * FRAME_SIZE + c * SAMPLE_SIZE);
        xNext = chunk.readInt16LE((k + 1) * FRAME_SIZE + c * SAMPLE_SIZE);
        interpolated = xNext * mu + xPrev * (1 - mu) | 0;
        newChunk.writeInt16LE(interpolated, z);
        z += SAMPLE_SIZE;
      }
    }
    chunk.copy(newChunk, newLength - FRAME_SIZE, chunkLength - FRAME_SIZE);
    return newChunk;
  };

}).call(this);

}).call(this,require("buffer").Buffer)
},{"buffer":1}],8:[function(require,module,exports){
module.exports=[{"x":0,"y":0},{"x":35,"y":382.9591836734694},{"x":539,"y":296.91836734693874},{"x":1294,"y":-40.122448979591866},{"x":1797,"y":-177.40816326530606},{"x":2049,"y":-11.448979591836933},{"x":2300,"y":155.51020408163265},{"x":2804,"y":69.46938775510183},{"x":3308,"y":-42.693877551020805},{"x":3812,"y":-128.73469387755128},{"x":4063,"y":38.22448979591797},{"x":4565,"y":-45.816326530612244},{"x":4817,"y":94.02040816326505},{"x":5321,"y":7.979591836734562},{"x":5825,"y":-78.06122448979592},{"x":6077,"y":87.89795918367321},{"x":6580,"y":-49.38775510204081},{"x":6833,"y":115.57142857142883},{"x":7586,"y":-219.46938775510282},{"x":7587,"y":197.48979591836707},{"x":8340,"y":-163.6734693877551},{"x":8592,"y":2.285714285714022},{"x":8844,"y":168.24489795918313},{"x":9599,"y":-168.79591836734747},{"x":9850,"y":-27.959183673469386},{"x":10102,"y":137.99999999999974},{"x":10607,"y":50.95918367346912},{"x":11110,"y":-34.08163265306122},{"x":11614,"y":-146.2448979591842},{"x":11866,"y":19.714285714284923},{"x":12118,"y":185.67346938775404},{"x":12871,"y":-149.36734693877497},{"x":13126,"y":-38.653061224489264},{"x":13378,"y":127.30612244897853},{"x":13881,"y":42.26530612244951},{"x":14384,"y":-42.77551020408216},{"x":14636,"y":97.06122448979644},{"x":15140,"y":11.020408163265305},{"x":15642,"y":-73.0204081632669},{"x":16144,"y":-157.06122448979644},{"x":16145,"y":233.77551020408163},{"x":16898,"y":-101.26530612245003},{"x":17150,"y":64.6938775510204},{"x":17653,"y":-20.34693877551126},{"x":18156,"y":-157.63265306122395},{"x":18407,"y":9.326530612243314},{"x":18659,"y":175.28571428571377},{"x":19414,"y":-161.75510204081684},{"x":19666,"y":-21.918367346938247},{"x":19918,"y":144.04081632652955},{"x":20420,"y":60},{"x":20924,"y":-26.04081632653114},{"x":21426,"y":-136.20408163265253},{"x":21677,"y":30.75510204081474},{"x":22181,"y":-55.28571428571376},{"x":22432,"y":111.67346938775351},{"x":22936,"y":-0.48979591836681896},{"x":23441,"y":-87.53061224489743},{"x":23694,"y":77.4285714285709},{"x":24196,"y":-6.612244897961295},{"x":24697,"y":-141.8979591836724},{"x":24949,"y":24.06122448979275},{"x":25202,"y":189.02040816326635},{"x":25956,"y":-147.0204081632674},{"x":26207,"y":-6.183673469386699},{"x":26459,"y":159.77551020407847},{"x":27214,"y":-177.26530612245213},{"x":27464,"y":-9.306122448982759},{"x":27715,"y":131.53061224489795},{"x":28218,"y":46.48979591836629},{"x":28721,"y":-38.55102040816538},{"x":29224,"y":-123.59183673469704},{"x":29476,"y":-9.877551020410275},{"x":29728,"y":156.08163265306015},{"x":30481,"y":-178.9591836734715},{"x":30732,"y":-11.999999999998943},{"x":30984,"y":127.83673469387438},{"x":31487,"y":42.795918367347994},{"x":31991,"y":-43.244897959185785},{"x":32493,"y":-127.28571428571534},{"x":32745,"y":12.551020408163264},{"x":32997,"y":178.5102040816337},{"x":33752,"y":-158.5306122448969},{"x":34003,"y":8.428571428570372},{"x":34254,"y":149.2653061224458},{"x":35008,"y":-186.77551020408268},{"x":35260,"y":-20.816326530612244},{"x":35512,"y":145.1428571428582},{"x":36014,"y":8.857142857139689},{"x":36517,"y":-76.18367346938669},{"x":36770,"y":88.77551020408163},{"x":37274,"y":2.7346938775478526},{"x":37776,"y":-107.42857142857353},{"x":38028,"y":58.5306122448969},{"x":38530,"y":-25.51020408163265},{"x":38782,"y":140.4489795918378},{"x":39536,"y":-221.71428571428783},{"x":39538,"y":194.24489795918262},{"x":40292,"y":-141.79591836734588},{"x":40544,"y":24.163265306119282},{"x":40795,"y":165},{"x":41549,"y":-171.0408163265338},{"x":41801,"y":-5.081632653063336},{"x":42052,"y":161.87755102040921},{"x":42807,"y":-227.40816326530506},{"x":42808,"y":189.5510204081622},{"x":43561,"y":-145.48979591836945},{"x":43813,"y":20.469387755100986},{"x":44065,"y":160.30612244897958},{"x":44819,"y":-175.73469387755418},{"x":45072,"y":-10.775510204080577},{"x":45323,"y":156.1836734693867},{"x":46077,"y":-205.97959183673362},{"x":46078,"y":210.97959183673362},{"x":46831,"y":-124.06122448979802},{"x":47083,"y":41.89795918367241},{"x":47586,"y":-95.38775510204293},{"x":47838,"y":70.57142857142223},{"x":48341,"y":-14.469387755104153},{"x":48844,"y":-99.51020408163053},{"x":49096,"y":40.326530612242784},{"x":49599,"y":-44.7142857142836},{"x":49850,"y":122.24489795918367},{"x":50354,"y":36.204081632655175},{"x":50855,"y":-72.95918367346938},{"x":51107,"y":92.99999999999578},{"x":51609,"y":8.959183673471498},{"x":52113,"y":-77.08163265306756},{"x":52365,"y":62.755102040816325},{"x":52867,"y":-21.28571428571851},{"x":53371,"y":-107.32653061224701},{"x":53623,"y":58.63265306121815},{"x":54128,"y":-80.65306122449613},{"x":54379,"y":86.3061224489817},{"x":54882,"y":1.265306122444756},{"x":55385,"y":-83.77551020408163},{"x":55636,"y":57.0612244897938},{"x":56139,"y":-27.97959183673258},{"x":56391,"y":137.97959183673257},{"x":56897,"y":49.938775510199854},{"x":57400,"y":-61.224489795918366},{"x":57903,"y":-146.2653061224553},{"x":58154,"y":20.69387755102252},{"x":58406,"y":186.6530612244877},{"x":59160,"y":-201.6326530612245},{"x":59161,"y":215.32653061224278},{"x":59916,"y":-121.71428571428783},{"x":60168,"y":44.24489795917734},{"x":60672,"y":-67.918367346943},{"x":60924,"y":98.04081632653272},{"x":61427,"y":12.999999999995776},{"x":61930,"y":-72.0408163265306},{"x":62182,"y":67.79591836734271},{"x":62687,"y":-19.244897959187895},{"x":63189,"y":-103.28571428571217},{"x":63441,"y":62.67346938775299},{"x":63944,"y":-48.48979591836523},{"x":64196,"y":117.46938775509993},{"x":64950,"y":-218.57142857142856},{"x":64951,"y":198.3877551020387},{"x":65705,"y":-189.89795918367346},{"x":65705,"y":228.0612244897959},{"x":66459,"y":-107.97959183673258},{"x":66710,"y":58.97959183673469},{"x":67213,"y":-52.18367346939409},{"x":67715,"y":-136.22448979591837},{"x":67967,"y":29.734693877546796},{"x":68219,"y":195.69387755102252},{"x":68973,"y":-166.46938775510836},{"x":69225,"y":-0.5102040816326531},{"x":69476,"y":166.44897959183461},{"x":70229,"y":-168.59183673469175},{"x":70481,"y":-54.87755102041027},{"x":70735,"y":109.08163265306122},{"x":71237,"y":25.04081632652639},{"x":71740,"y":-60},{"x":71991,"y":80.83673469387544},{"x":72493,"y":-3.204081632659397},{"x":72995,"y":-87.24489795918367},{"x":73246,"y":79.7142857142836},{"x":73749,"y":-31.44897959183462},{"x":74250,"y":-114.48979591836735},{"x":74502,"y":51.46938775509781},{"x":75005,"y":-33.57142857142857},{"x":75256,"y":107.26530612244686},{"x":75758,"y":23.22448979591203},{"x":76261,"y":-61.816326530614354},{"x":76513,"y":104.1428571428508},{"x":77015,"y":-32.14285714285714},{"x":77517,"y":-116.18367346939198},{"x":77768,"y":50.775510204075296},{"x":78271,"y":-34.26530612245109},{"x":78523,"y":105.57142857142223},{"x":79027,"y":19.530612244893735},{"x":79530,"y":-65.51020408163265},{"x":79783,"y":99.4489795918304},{"x":80287,"y":-12.714285714289938},{"x":80791,"y":-98.75510204081843},{"x":81043,"y":67.20408163264672},{"x":81546,"y":-17.836734693879663},{"x":82048,"y":-128.00000000000634},{"x":82299,"y":38.9591836734715},{"x":82801,"y":-45.08163265306334},{"x":83053,"y":120.87755102040182},{"x":83555,"y":-15.408163265306122},{"x":84058,"y":-100.44897959184307},{"x":84310,"y":65.51020408163265},{"x":84813,"y":-19.530612244904294},{"x":85065,"y":120.3061224489796},{"x":85819,"y":-215.7346938775489},{"x":85819,"y":202.22448979592048},{"x":86571,"y":-131.81632653061436},{"x":86823,"y":8.02040816325897},{"x":87325,"y":-76.0204081632653},{"x":87577,"y":89.93877551019986},{"x":88080,"y":4.8979591836734695},{"x":88332,"y":118.61224489795495},{"x":89086,"y":-217.42857142857352},{"x":89086,"y":200.53061224489585},{"x":89840,"y":-135.51020408163265},{"x":90092,"y":4.326530612240674},{"x":90595,"y":-80.71428571428571},{"x":90847,"y":85.24489795917945},{"x":91350,"y":0.20408163265306123},{"x":91602,"y":140.0408163265264},{"x":92356,"y":-196.0000000000021},{"x":92607,"y":-29.040816326534834},{"x":92860,"y":135.91836734693877},{"x":93362,"y":25.7551020408121},{"x":93866,"y":-60.285714285716395},{"x":94117,"y":106.67346938775087},{"x":94619,"y":22.632653061226602},{"x":95122,"y":-114.65306122449401},{"x":95374,"y":51.306122448971145},{"x":95878,"y":-34.734693877546796},{"x":96382,"y":-120.77551020408585},{"x":96633,"y":20.061224489800143},{"x":96886,"y":185.02040816325263},{"x":97640,"y":-151.0204081632653},{"x":97892,"y":14.938775510199857},{"x":98144,"y":154.77551020407319},{"x":98898,"y":-181.26530612244474},{"x":99150,"y":-15.306122448979592},{"x":99402,"y":150.65306122448555},{"x":99906,"y":12.36734693876284},{"x":100408,"y":-71.67346938775087},{"x":100660,"y":94.28571428571428},{"x":101163,"y":9.244897959187897},{"x":101666,"y":-101.91836734695144},{"x":101918,"y":64.04081632653484},{"x":102421,"y":-21.00000000001267},{"x":102923,"y":-105.04081632652638},{"x":103175,"y":34.795918367346935},{"x":103678,"y":-50.24489795917945},{"x":103931,"y":114.71428571427305},{"x":104434,"y":29.673469387746653},{"x":104936,"y":-80.48979591838001},{"x":105187,"y":86.46938775509781},{"x":105690,"y":1.4285714285714286},{"x":106192,"y":-82.61224489796341},{"x":106443,"y":32.10204081633076},{"x":106946,"y":-52.93877551021675},{"x":107198,"y":113.02040816326952},{"x":107701,"y":27.979591836722022},{"x":108204,"y":-83.1836734693962},{"x":108455,"y":83.77551020408163},{"x":108958,"y":-1.265306122444756},{"x":109461,"y":-86.30612244899226},{"x":109712,"y":54.53061224489373},{"x":110215,"y":-30.51020408163265},{"x":110718,"y":-115.55102040815903},{"x":110969,"y":51.408163265297674},{"x":111471,"y":-84.87755102042082},{"x":111723,"y":81.08163265306544},{"x":112226,"y":-3.9591836734820585}]
},{}]},{},[4])