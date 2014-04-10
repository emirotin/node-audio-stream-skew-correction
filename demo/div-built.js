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
  var graph, resample;

  resample = require('./resample');

  graph = new Rickshaw.Graph({
    element: document.querySelector("#chart"),
    width: 800,
    height: 400,
    renderer: 'line',
    series: [
      {
        data: require('./id.json'),
        color: 'red'
      }, {
        data: require('./zero.json'),
        color: 'green'
      }, {
        data: require('./interpolate.json'),
        color: 'blue'
      }
    ]
  });

  graph.render();

}).call(this);

},{"./id.json":5,"./interpolate.json":6,"./resample":7,"./zero.json":8}],5:[function(require,module,exports){
module.exports=[{"x":0,"y":0},{"x":33,"y":384.9591836734694},{"x":535,"y":300.9183673469388},{"x":1038,"y":215.87755102040808},{"x":1291,"y":328.5918367346939},{"x":1794,"y":243.55102040816305},{"x":2297,"y":158.5102040816327},{"x":2550,"y":323.46938775510205},{"x":3054,"y":211.30612244897972},{"x":3305,"y":378.265306122449},{"x":3808,"y":293.224489795918},{"x":4312,"y":207.1836734693875},{"x":4565,"y":346.0204081632653},{"x":5069,"y":259.9795918367348},{"x":5573,"y":173.93877551020367},{"x":5825,"y":339.89795918367344},{"x":6327,"y":203.6122448979589},{"x":6579,"y":369.57142857142804},{"x":7082,"y":284.53061224489767},{"x":7585,"y":199.48979591836735},{"x":7837,"y":339.3265306122446},{"x":8339,"y":255.28571428571374},{"x":8841,"y":171.24489795918288},{"x":9094,"y":336.2040816326525},{"x":9597,"y":225.04081632653035},{"x":9850,"y":390},{"x":10351,"y":306.9591836734686},{"x":10853,"y":222.91836734693902},{"x":11105,"y":362.7551020408163},{"x":11607,"y":278.71428571428544},{"x":12111,"y":192.67346938775563},{"x":12364,"y":357.63265306122395},{"x":12869,"y":218.34693877550967},{"x":13119,"y":386.30612244897907},{"x":13623,"y":300.2653061224479},{"x":14125,"y":216.22448979591837},{"x":14377,"y":356.0612244897943},{"x":14880,"y":271.0204081632653},{"x":15382,"y":186.9795918367331},{"x":15634,"y":352.9387755102035},{"x":16137,"y":241.77551020408004},{"x":16640,"y":156.73469387755102},{"x":16892,"y":322.69387755101883},{"x":17395,"y":237.6530612244898},{"x":17646,"y":352.36734693877605},{"x":18150,"y":266.3265306122449},{"x":18653,"y":181.28571428571323},{"x":18904,"y":348.2448979591831},{"x":19407,"y":237.08163265305964},{"x":19909,"y":153.0408163265301},{"x":20161,"y":319.0000000000005},{"x":20664,"y":233.95918367346886},{"x":20916,"y":373.79591836734744},{"x":21420,"y":287.7551020408163},{"x":21924,"y":201.71428571428518},{"x":22175,"y":368.67346938775506},{"x":22679,"y":256.51020408163214},{"x":23181,"y":172.46938775510256},{"x":23432,"y":339.42857142856985},{"x":23933,"y":256.38775510203976},{"x":24185,"y":370.1020408163265},{"x":24688,"y":285.0612244897949},{"x":25191,"y":200.0204081632632},{"x":25443,"y":365.9795918367336},{"x":25945,"y":255.81632653061223},{"x":26448,"y":170.77551020408058},{"x":26700,"y":336.734693877551},{"x":27201,"y":253.6938775510183},{"x":27453,"y":393.5306122448969},{"x":27956,"y":308.48979591836525},{"x":28458,"y":224.44897959183567},{"x":28710,"y":390.4081632653061},{"x":29213,"y":253.12244897959079},{"x":29716,"y":168.0816326530591},{"x":29966,"y":336.0408163265285},{"x":30469,"y":250.99999999999682},{"x":30721,"y":390.8367346938754},{"x":31223,"y":306.79591836734585},{"x":31727,"y":220.75510204081738},{"x":31980,"y":385.7142857142857},{"x":32483,"y":274.5510204081622},{"x":32986,"y":189.51020408163055},{"x":33238,"y":355.46938775510097},{"x":33741,"y":270.4285714285693},{"x":34243,"y":160.26530612244792},{"x":34495,"y":326.2244897959184},{"x":34998,"y":241.1836734693867},{"x":35500,"y":157.14285714285714},{"x":35752,"y":270.8571428571439},{"x":36256,"y":184.81632653061013},{"x":36509,"y":349.77551020407844},{"x":37011,"y":265.7346938775489},{"x":37514,"y":154.5714285714254},{"x":37767,"y":319.53061224489903},{"x":38270,"y":234.48979591836735},{"x":38522,"y":400.44897959183777},{"x":39026,"y":288.2857142857122},{"x":39528,"y":204.24489795918262},{"x":39780,"y":370.2040816326531},{"x":40282,"y":286.1632653061235},{"x":40785,"y":175},{"x":41037,"y":340.9591836734704},{"x":41539,"y":256.9183673469356},{"x":42042,"y":171.87755102040921},{"x":42293,"y":286.59183673469283},{"x":42797,"y":200.5510204081643},{"x":43048,"y":367.51020408163157},{"x":43551,"y":282.46938775509994},{"x":44054,"y":171.30612244897642},{"x":44305,"y":338.265306122449},{"x":44809,"y":252.2244897959152},{"x":45312,"y":167.1836734693888},{"x":45564,"y":307.0204081632621},{"x":46067,"y":221.97959183673575},{"x":46318,"y":388.938775510203},{"x":46821,"y":303.89795918367133},{"x":47325,"y":165.6122448979592},{"x":47577,"y":331.57142857142435},{"x":48081,"y":245.53061224489585},{"x":48584,"y":160.48979591836945},{"x":48836,"y":300.3265306122428},{"x":49338,"y":216.28571428570794},{"x":49590,"y":382.2448979591837},{"x":50094,"y":296.2040816326552},{"x":50597,"y":185.0408163265264},{"x":50849,"y":351.0000000000021},{"x":51353,"y":264.95918367346303},{"x":51857,"y":178.91836734693456},{"x":52110,"y":317.7551020408163},{"x":52612,"y":233.7142857142815},{"x":52864,"y":399.6734693877572},{"x":53367,"y":314.63265306122025},{"x":53876,"y":171.34693877550808},{"x":54128,"y":337.30612244897327},{"x":54631,"y":252.26530612244687},{"x":55133,"y":168.22448979591204},{"x":55385,"y":308.0612244897959},{"x":55887,"y":224.02040816326107},{"x":56140,"y":388.9795918367347},{"x":56643,"y":303.93877551019773},{"x":57144,"y":194.77551020408373},{"x":57397,"y":359.73469387754676},{"x":57900,"y":274.6938775510204},{"x":58403,"y":189.65306122448345},{"x":58655,"y":303.3673469387755},{"x":59158,"y":218.32653061223854},{"x":59409,"y":385.2857142857164},{"x":59912,"y":300.24489795917947},{"x":60416,"y":188.0816326530591},{"x":60668,"y":354.0408163265243},{"x":61170,"y":270},{"x":61673,"y":184.95918367346306},{"x":61925,"y":324.7959183673469},{"x":62427,"y":240.7551020408121},{"x":62680,"y":405.7142857142857},{"x":63182,"y":321.67346938775086},{"x":63685,"y":210.51020408163265},{"x":63937,"y":376.4693877550978},{"x":64440,"y":291.42857142857144},{"x":64943,"y":206.38775510203448},{"x":65196,"y":319.1020408163244},{"x":65698,"y":235.06122448978957},{"x":66201,"y":150.0204081632632},{"x":66452,"y":316.97959183673044},{"x":66956,"y":204.81632653061013},{"x":67208,"y":370.77551020407526},{"x":67710,"y":286.734693877551},{"x":68213,"y":201.69387755101405},{"x":68466,"y":340.53061224489585},{"x":68968,"y":256.489795918361},{"x":69471,"y":171.44897959183461},{"x":69723,"y":337.4081632652998},{"x":70227,"y":199.1224489795876},{"x":70480,"y":364.0816326530612},{"x":70983,"y":279.0408163265243},{"x":71485,"y":195},{"x":71738,"y":333.8367346938712},{"x":72241,"y":248.79591836734483},{"x":72745,"y":162.75510204081633},{"x":72997,"y":328.71428571428146},{"x":73500,"y":217.55102040816325},{"x":73753,"y":382.5102040816263},{"x":74256,"y":297.46938775509994},{"x":74758,"y":213.42857142856508},{"x":75010,"y":353.265306122449},{"x":75513,"y":268.224489795912},{"x":76016,"y":183.18367346938564},{"x":76269,"y":348.14285714285927},{"x":76772,"y":210.85714285713863},{"x":77025,"y":375.81632653061223},{"x":77528,"y":290.77551020407526},{"x":78031,"y":205.7346938775489},{"x":78283,"y":345.57142857142225},{"x":78785,"y":261.53061224489795},{"x":79286,"y":178.48979591836522},{"x":79538,"y":344.4489795918304},{"x":80040,"y":234.28571428571428},{"x":80293,"y":399.2448979591773},{"x":80796,"y":314.2040816326509},{"x":81299,"y":229.16326530612454},{"x":81552,"y":367.99999999999574},{"x":82056,"y":281.9591836734673},{"x":82559,"y":196.91836734694087},{"x":82811,"y":362.87755102040603},{"x":83314,"y":225.591836734696},{"x":83565,"y":392.55102040816325},{"x":84070,"y":305.51020408163265},{"x":84574,"y":219.46938775510415},{"x":84826,"y":359.3061224489775},{"x":85328,"y":275.2653061224426},{"x":85832,"y":189.22448979591414},{"x":86084,"y":355.1836734693899},{"x":86588,"y":243.02040816325896},{"x":87092,"y":156.97959183673046},{"x":87343,"y":323.93877551019773},{"x":87846,"y":238.89795918367136},{"x":88098,"y":352.61224489795285},{"x":88601,"y":267.57142857142645},{"x":89104,"y":182.53061224490006},{"x":89357,"y":347.4897959183631},{"x":89861,"y":235.32653061224278},{"x":90113,"y":401.2857142857079},{"x":90616,"y":316.24489795918157},{"x":91119,"y":231.20408163265517},{"x":91370,"y":372.0408163265306},{"x":91873,"y":286.99999999999363},{"x":92376,"y":201.95918367346727},{"x":92629,"y":366.9183673469409},{"x":93131,"y":256.7551020408142},{"x":93633,"y":172.71428571427938},{"x":93886,"y":337.67346938775296},{"x":94389,"y":252.6326530612266},{"x":94640,"y":367.3469387755102},{"x":95144,"y":281.3061224489711},{"x":95646,"y":197.2653061224363},{"x":95898,"y":363.2244897959226},{"x":96401,"y":252.06122448978323},{"x":96903,"y":168.02040816326954},{"x":97154,"y":334.97959183672623},{"x":97657,"y":249.93877551019986},{"x":97909,"y":389.77551020407316},{"x":98412,"y":304.73469387754676},{"x":98916,"y":218.69387755100772},{"x":99168,"y":384.653061224494},{"x":99671,"y":247.36734693876284},{"x":100173,"y":163.32653061224912},{"x":100426,"y":328.2857142857016},{"x":100928,"y":244.24489795918788},{"x":101181,"y":383.08163265304853},{"x":101684,"y":298.04081632652213},{"x":102188,"y":212.0000000000042},{"x":102441,"y":376.9591836734567},{"x":102944,"y":265.79591836733846},{"x":103447,"y":180.7551020408121},{"x":103699,"y":346.71428571427725},{"x":104203,"y":260.6734693877593},{"x":104454,"y":401.5102040816242},{"x":104957,"y":316.4693877550978},{"x":105459,"y":232.42857142856298},{"x":105711,"y":398.3877551020281},{"x":106214,"y":261.1020408163181},{"x":106716,"y":177.06122448978323},{"x":106969,"y":342.02040816325683},{"x":107472,"y":256.97959183673044},{"x":107724,"y":396.81632653060376},{"x":108227,"y":311.7755102040774},{"x":108730,"y":226.73469387755102},{"x":108982,"y":392.69387755101616},{"x":109486,"y":280.5306122448853},{"x":109989,"y":195.48979591835888},{"x":110241,"y":361.44897959182407},{"x":110745,"y":275.4081632653061},{"x":110998,"y":388.1224489795961},{"x":111503,"y":301.0816326530654},{"x":112005,"y":217.0408163265306}]
},{}],6:[function(require,module,exports){
module.exports=[{"x":0,"y":0},{"x":34,"y":383.95918367346934},{"x":553,"y":282.9183673469388},{"x":1321,"y":-67.1224489795918},{"x":1577,"y":42.59183673469394},{"x":2085,"y":-47.44897959183673},{"x":2594,"y":-138.48979591836755},{"x":2850,"y":23.46938775510204},{"x":3108,"y":157.30612244897918},{"x":3869,"y":-185.73469387755088},{"x":3873,"y":228.22448979591798},{"x":4635,"y":-115.81632653061224},{"x":4891,"y":20.020408163265174},{"x":5397,"y":-68.02040816326557},{"x":5653,"y":93.93877551020368},{"x":6162,"y":2.8979591836732053},{"x":6665,"y":-134.3877551020408},{"x":6921,"y":27.571428571427777},{"x":7179,"y":187.5306122448974},{"x":7940,"y":-155.51020408163265},{"x":8195,"y":-18.6734693877551},{"x":8448,"y":146.28571428571453},{"x":9208,"y":-195.75510204081607},{"x":9463,"y":-32.79591836734667},{"x":9719,"y":103.04081632653008},{"x":10229,"y":10.999999999999472},{"x":10732,"y":-74.04081632653087},{"x":10989,"y":86.91836734693824},{"x":11498,"y":-30.244897959183408},{"x":11753,"y":132.71428571428598},{"x":12514,"y":-210.32653061224542},{"x":12517,"y":204.6326530612229},{"x":13280,"y":-192.6530612244898},{"x":13284,"y":221.30612244897907},{"x":14048,"y":-124.73469387755208},{"x":14303,"y":38.22448979591731},{"x":14812,"y":-78.93877551020566},{"x":15068,"y":83.02040816326425},{"x":15577,"y":-8.02040816326689},{"x":16080,"y":-93.06122448979592},{"x":16336,"y":42.77551020408216},{"x":16847,"y":-50.26530612245056},{"x":17104,"y":110.69387755101988},{"x":17614,"y":18.653061224489267},{"x":18117,"y":-118.63265306122607},{"x":18373,"y":43.32653061224384},{"x":18883,"y":-48.71428571428677},{"x":19141,"y":111.2448979591842},{"x":19651,"y":-6.918367346938247},{"x":20154,"y":-91.95918367346991},{"x":20410,"y":70},{"x":20919,"y":-21.04081632653114},{"x":21176,"y":113.79591836734747},{"x":21685,"y":22.755102040816325},{"x":22193,"y":-67.28571428571534},{"x":22701,"y":-157.32653061224437},{"x":22956,"y":-20.48979591836682},{"x":23213,"y":140.46938775510097},{"x":23725,"y":46.42857142857143},{"x":24234,"y":-44.61224489796235},{"x":24491,"y":64.10204081632442},{"x":25000,"y":-26.93877551020408},{"x":25508,"y":-116.97959183673575},{"x":25764,"y":44.97959183673152},{"x":26273,"y":-72.18367346938881},{"x":26529,"y":89.77551020407846},{"x":27037,"y":-0.2653061224479237},{"x":27539,"y":-84.30612244898276},{"x":27795,"y":51.53061224489796},{"x":28305,"y":-40.51020408163265},{"x":28562,"y":120.44897959183778},{"x":29070,"y":30.408163265306122},{"x":29576,"y":-109.87755102041027},{"x":29831,"y":53.08163265305911},{"x":30340,"y":-37.95918367346939},{"x":30596,"y":123.99999999999788},{"x":31106,"y":5.836734693875439},{"x":31609,"y":-79.20408163265623},{"x":31865,"y":82.75510204081633},{"x":32374,"y":-8.285714285717454},{"x":32877,"y":-119.44897959183568},{"x":33133,"y":42.5102040816316},{"x":33643,"y":-49.53061224489901},{"x":33899,"y":112.42857142856826},{"x":34408,"y":-4.734693877552076},{"x":34911,"y":-89.77551020408374},{"x":35167,"y":72.18367346938881},{"x":35676,"y":-18.857142857144968},{"x":36180,"y":-157.14285714285714},{"x":36436,"y":4.816326530610133},{"x":36688,"y":170.77551020408058},{"x":37450,"y":-173.26530612244898},{"x":37704,"y":-35.42857142857459},{"x":37961,"y":125.53061224489585},{"x":38471,"y":33.48979591836523},{"x":38981,"y":-58.55102040816538},{"x":39235,"y":79.28571428571428},{"x":39745,"y":-12.755102040816325},{"x":40248,"y":-97.795918367348},{"x":40504,"y":64.16326530611929},{"x":41011,"y":-51.00000000000211},{"x":41269,"y":108.95918367346621},{"x":41779,"y":16.918367346935607},{"x":42281,"y":-67.12244897959394},{"x":42536,"y":43.59183673469177},{"x":43044,"y":-46.4489795918399},{"x":43550,"y":-134.48979591836735},{"x":43808,"y":25.469387755100986},{"x":44066,"y":159.30612244897748},{"x":44826,"y":-182.73469387755313},{"x":44830,"y":231.22448979591837},{"x":45591,"y":-111.81632653061435},{"x":45845,"y":26.020408163265305},{"x":46353,"y":-64.02040816326635},{"x":46608,"y":98.93877551020302},{"x":47118,"y":6.8979591836724135},{"x":47621,"y":-130.38775510204292},{"x":47876,"y":32.57142857142646},{"x":48384,"y":-57.46938775509993},{"x":48641,"y":103.48979591836523},{"x":49149,"y":-12.67346938775299},{"x":49652,"y":-97.71428571428993},{"x":49907,"y":65.24489795917945},{"x":50417,"y":-26.795918367351163},{"x":50674,"y":108.04081632653272},{"x":51185,"y":15},{"x":51687,"y":-69.04081632653484},{"x":51943,"y":92.91836734693244},{"x":52453,"y":-25.24489795919001},{"x":52961,"y":-115.2857142857164},{"x":53217,"y":46.67346938775088},{"x":53727,"y":-45.36734693877973},{"x":53984,"y":63.346938775512314},{"x":54493,"y":-27.69387755102674},{"x":54751,"y":132.26530612244687},{"x":55511,"y":-209.77551020408373},{"x":55516,"y":177.0612244897938},{"x":56275,"y":-163.9795918367347},{"x":56543,"y":-14.020408163271641},{"x":56796,"y":150.93877551020196},{"x":57306,"y":32.77551020407952},{"x":57813,"y":-56.265306122455314},{"x":58320,"y":-145.30612244897958},{"x":58574,"y":18.653061224491907},{"x":58826,"y":132.36734693877338},{"x":59336,"y":40.326530612242784},{"x":59842,"y":-47.714285714289936},{"x":60351,"y":-138.75510204081843},{"x":60604,"y":0.08163265306333634},{"x":60857,"y":165.0408163265264},{"x":61367,"y":72.99999999999578},{"x":61876,"y":-18.040816326532724},{"x":62380,"y":-130.20408163265304},{"x":62635,"y":32.755102040816325},{"x":63145,"y":-59.285714285714285},{"x":63402,"y":101.67346938775087},{"x":63912,"y":-16.48979591837157},{"x":64414,"y":-100.53061224489585},{"x":64669,"y":62.42857142857354},{"x":65180,"y":-30.612244897959183},{"x":65437,"y":78.1020408163223},{"x":65943,"y":-9.938775510210418},{"x":66447,"y":-95.97959183673892},{"x":66703,"y":65.97959183672836},{"x":67212,"y":-51.18367346939198},{"x":67468,"y":110.77551020407529},{"x":68230,"y":-233.26530612244898},{"x":68233,"y":181.69387755101405},{"x":68742,"y":64.53061224489373},{"x":69251,"y":-26.510204081634765},{"x":69760,"y":-117.55102040816327},{"x":70014,"y":46.40816326530823},{"x":70522,"y":-95.87755102041238},{"x":70779,"y":65.08163265306334},{"x":71288,"y":-25.95918367347572},{"x":71545,"y":135},{"x":72055,"y":16.83673469387755},{"x":72558,"y":-68.2040816326594},{"x":72814,"y":93.75510204081843},{"x":73324,"y":1.714285714287826},{"x":73827,"y":-109.44897959184095},{"x":74082,"y":53.51020408162843},{"x":74591,"y":-37.53061224490007},{"x":75099,"y":-127.57142857142645},{"x":75354,"y":9.265306122451092},{"x":75607,"y":174.22448979591414},{"x":76365,"y":-165.81632653061223},{"x":76620,"y":-2.857142857142857},{"x":76872,"y":110.85714285713863},{"x":77382,"y":18.81632653060802},{"x":77885,"y":-66.22448979591836},{"x":78140,"y":96.73469387755102},{"x":78651,"y":-22.42857142857354},{"x":79159,"y":-112.46938775509993},{"x":79416,"y":48.48979591836523},{"x":79926,"y":-43.55102040816538},{"x":80182,"y":92.28571428571006},{"x":80692,"y":0.2448979591794498},{"x":81194,"y":-83.79591836734483},{"x":81450,"y":78.16326530612244},{"x":81960,"y":-40},{"x":82217,"y":120.95918367346516},{"x":82978,"y":-222.08163265306754},{"x":82981,"y":192.87755102040603},{"x":83490,"y":49.59183673469388},{"x":84000,"y":-42.44897959183673},{"x":84508,"y":-132.4897959183737},{"x":84763,"y":30.469387755095703},{"x":85271,"y":-85.69387755102252},{"x":85527,"y":76.26530612244476},{"x":86036,"y":-14.775510204083744},{"x":86288,"y":151.1836734693814},{"x":87048,"y":-216.97959183674104},{"x":87050,"y":198.9795918367347},{"x":87811,"y":-144.06122448979804},{"x":88066,"y":18.897959183671357},{"x":88318,"y":132.61224489795285},{"x":88828,"y":40.57142857142223},{"x":89337,"y":-50.46938775510626},{"x":89842,"y":-137.51020408163689},{"x":90098,"y":-1.6734693877614375},{"x":90349,"y":165.28571428571638},{"x":91107,"y":-174.75510204082053},{"x":91362,"y":-11.795918367351161},{"x":91613,"y":129.04081632652426},{"x":92120,"y":40},{"x":92629,"y":-51.0408163265285},{"x":93136,"y":-140.08163265306334},{"x":93391,"y":-3.2448979591857854},{"x":93643,"y":162.71428571427938},{"x":94402,"y":-178.32653061224912},{"x":94406,"y":235.63265306122236},{"x":95167,"y":-159.65306122449402},{"x":95423,"y":2.3061224489838152},{"x":95926,"y":-82.73469387756369},{"x":96182,"y":79.22448979591414},{"x":96692,"y":-38.9387755102083},{"x":96948,"y":123.02040816326952},{"x":97458,"y":30.979591836738916},{"x":97965,"y":-58.06122448979592},{"x":98221,"y":77.77551020406896},{"x":98730,"y":-13.26530612244898},{"x":99232,"y":-97.30612244898381},{"x":99489,"y":63.65306122448135},{"x":99996,"y":-77.63265306123716},{"x":100253,"y":83.32653061224912},{"x":100764,"y":-9.714285714294162},{"x":101267,"y":-94.75510204082055},{"x":101523,"y":41.08163265306545},{"x":102033,"y":-50.95918367346516},{"x":102289,"y":110.99999999999154},{"x":102800,"y":17.959183673469386},{"x":103303,"y":-93.20408163264884},{"x":103559,"y":68.75510204080787},{"x":104068,"y":-22.28571428571006},{"x":104576,"y":-112.32653061225757},{"x":104831,"y":24.51020408161998},{"x":105088,"y":185.46938775510625},{"x":105848,"y":-156.57142857142435},{"x":106104,"y":5.387755102032369},{"x":106356,"y":119.10204081631386},{"x":106864,"y":29.06122448978747},{"x":107372,"y":-60.97959183673892},{"x":107879,"y":-150.02040816327374},{"x":108135,"y":-14.183673469387754},{"x":108387,"y":151.7755102040774},{"x":108898,"y":58.734693877555245},{"x":109406,"y":-31.306122448992262},{"x":109914,"y":-147.4693877551105},{"x":110169,"y":15.4897959183589},{"x":110421,"y":181.44897959182407},{"x":111184,"y":-163.59183673470233},{"x":111439,"y":-52.87755102041661},{"x":111696,"y":108.08163265304854},{"x":112203,"y":19.040816326534834}]
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
module.exports=[{"x":0,"y":0},{"x":34,"y":383.95918367346934},{"x":539,"y":296.91836734693874},{"x":1296,"y":-42.1224489795918},{"x":1799,"y":-179.4081632653063},{"x":1800,"y":237.55102040816325},{"x":2555,"y":-99.48979591836735},{"x":2807,"y":66.4693877551021},{"x":3311,"y":-45.69387755102054},{"x":3814,"y":-130.73469387755088},{"x":4066,"y":35.22448979591823},{"x":4569,"y":-49.81632653061211},{"x":4823,"y":88.0204081632649},{"x":5326,"y":2.9795918367345617},{"x":5830,"y":-83.06122448979592},{"x":6082,"y":82.89795918367321},{"x":6585,"y":-54.38775510204081},{"x":6837,"y":111.5714285714283},{"x":7341,"y":25.530612244897167},{"x":7844,"y":-59.51020408163318},{"x":8096,"y":80.3265306122441},{"x":8600,"y":-5.714285714285714},{"x":9103,"y":-90.75510204081606},{"x":9354,"y":76.20408163265253},{"x":9858,"y":-35.95918367346912},{"x":10361,"y":-121.00000000000078},{"x":10612,"y":45.95918367346912},{"x":11116,"y":-40.081632653062016},{"x":11368,"y":99.75510204081658},{"x":11872,"y":13.71428571428545},{"x":12376,"y":-72.32653061224437},{"x":12628,"y":93.63265306122344},{"x":13134,"y":-46.65306122449032},{"x":13385,"y":120.3061224489796},{"x":14138,"y":-214.73469387755208},{"x":14139,"y":202.22448979591783},{"x":14893,"y":-159.93877551020512},{"x":15145,"y":6.020408163265306},{"x":15397,"y":171.9795918367331},{"x":16152,"y":-165.0612244897975},{"x":16403,"y":-24.22448979591942},{"x":16656,"y":140.73469387755154},{"x":17160,"y":54.69387755102041},{"x":17664,"y":-31.346938775510733},{"x":18167,"y":-168.63265306122608},{"x":18419,"y":-2.6734693877556297},{"x":18673,"y":161.28571428571323},{"x":19427,"y":-174.75510204081792},{"x":19430,"y":214.0816326530612},{"x":20184,"y":-121.95918367346991},{"x":20436,"y":44.000000000000526},{"x":20939,"y":-41.040816326531136},{"x":21192,"y":97.79591836734535},{"x":21696,"y":11.755102040816855},{"x":22200,"y":-74.28571428571428},{"x":22452,"y":91.67346938775351},{"x":22955,"y":-19.489795918367346},{"x":23458,"y":-104.53061224489902},{"x":23710,"y":61.42857142857142},{"x":24215,"y":-25.612244897959183},{"x":24718,"y":-162.89795918367452},{"x":24969,"y":4.0612244897927505},{"x":25221,"y":170.0204081632632},{"x":25976,"y":-167.0204081632674},{"x":25979,"y":221.81632653060908},{"x":26733,"y":-114.22448979591942},{"x":26986,"y":50.73469387754891},{"x":27489,"y":-34.306122448982755},{"x":27741,"y":105.53061224489585},{"x":28495,"y":-230.51020408163265},{"x":28496,"y":186.44897959183461},{"x":29249,"y":-148.59183673469704},{"x":29501,"y":-34.87755102041027},{"x":29754,"y":130.08163265305805},{"x":30258,"y":44.04081632652955},{"x":30760,"y":-40},{"x":31012,"y":99.8367346938786},{"x":31766,"y":-236.20408163265517},{"x":31767,"y":180.75510204081738},{"x":32521,"y":-155.28571428571638},{"x":32772,"y":-14.448979591835679},{"x":33025,"y":150.51020408163265},{"x":33528,"y":65.46938775510098},{"x":34031,"y":-19.571428571430683},{"x":34533,"y":-129.73469387755208},{"x":34785,"y":36.224489795918366},{"x":35288,"y":-48.8163265306133},{"x":35540,"y":117.14285714285714},{"x":36044,"y":-21.14285714286031},{"x":36547,"y":-106.18367346938669},{"x":36799,"y":59.775510204078465},{"x":37301,"y":-24.26530612245109},{"x":37804,"y":-135.4285714285746},{"x":38057,"y":29.530612244899014},{"x":38310,"y":194.48979591836735},{"x":39065,"y":-142.55102040816325},{"x":39317,"y":-2.7142857142846584},{"x":39570,"y":162.24489795918367},{"x":40324,"y":-173.7959183673501},{"x":40575,"y":-6.836734693877551},{"x":40827,"y":133.00000000000105},{"x":41331,"y":46.95918367346727},{"x":41834,"y":-38.08163265306439},{"x":42336,"y":-122.12244897959394},{"x":42587,"y":-7.408163265305066},{"x":42838,"y":159.5510204081622},{"x":43593,"y":-177.4897959183684},{"x":43845,"y":-11.53061224489796},{"x":44098,"y":127.30612244897853},{"x":44600,"y":43.265306122448976},{"x":45104,"y":-42.775510204084796},{"x":45607,"y":-127.81632653061118},{"x":45859,"y":12.020408163262138},{"x":46112,"y":176.97959183673575},{"x":46866,"y":-159.06122448979804},{"x":47118,"y":6.8979591836724135},{"x":47370,"y":120.61224489795919},{"x":47872,"y":36.57142857142435},{"x":48376,"y":-49.46938775510415},{"x":48880,"y":-135.51020408163265},{"x":49131,"y":5.326530612242786},{"x":49383,"y":171.28571428570794},{"x":50139,"y":-166.75510204081422},{"x":50391,"y":-0.7959183673490506},{"x":50644,"y":138.0408163265327},{"x":51397,"y":-197.0000000000042},{"x":51398,"y":219.95918367346306},{"x":52153,"y":-117.08163265306756},{"x":52404,"y":23.75510204081844},{"x":52908,"y":-62.28571428572062},{"x":53161,"y":102.67346938775299},{"x":53664,"y":17.632653061226602},{"x":54166,"y":-118.6530612244919},{"x":54419,"y":46.306122448981704},{"x":54922,"y":-38.734693877555245},{"x":55174,"y":127.22448979592048},{"x":55678,"y":15.061224489789582},{"x":56182,"y":-70.97959183673892},{"x":56435,"y":93.97959183673468},{"x":56940,"y":6.938775510204081},{"x":57444,"y":-105.22448979591626},{"x":57696,"y":60.73469387754891},{"x":58199,"y":-24.30612244897748},{"x":58702,"y":-109.34693877551443},{"x":58953,"y":5.367346938769175},{"x":59205,"y":171.32653061224488},{"x":59958,"y":-163.71428571429203},{"x":60209,"y":3.2448979591857854},{"x":60461,"y":143.0816326530591},{"x":60965,"y":57.04081632653061},{"x":61469,"y":-28.999999999997886},{"x":61972,"y":-114.04081632653484},{"x":62224,"y":25.79591836734905},{"x":62728,"y":-60.244897959190006},{"x":62979,"y":106.71428571428783},{"x":63483,"y":20.673469387748767},{"x":63987,"y":-91.48979591837157},{"x":64239,"y":74.46938775510415},{"x":64742,"y":-10.571428571432795},{"x":65245,"y":-95.61224489795919},{"x":65496,"y":19.10204081632442},{"x":65999,"y":-65.93877551020196},{"x":66251,"y":100.02040816326318},{"x":66753,"y":15.979591836728359},{"x":67257,"y":-96.18367346939198},{"x":67509,"y":69.77551020408374},{"x":68012,"y":-15.265306122453202},{"x":68264,"y":150.69387755102252},{"x":69017,"y":-210.46938775510625},{"x":69018,"y":206.489795918361},{"x":69772,"y":-129.5510204081675},{"x":70024,"y":36.40816326530823},{"x":70528,"y":-101.8775510204145},{"x":70780,"y":64.08163265306122},{"x":71285,"y":-22.959183673469386},{"x":71536,"y":143.9999999999979},{"x":72291,"y":-219.16326530612454},{"x":72291,"y":198.79591836734483},{"x":73045,"y":-137.24489795918367},{"x":73298,"y":27.714285714279377},{"x":73800,"y":-82.44897959183673},{"x":74052,"y":83.51020408162843},{"x":74555,"y":-1.530612244897959},{"x":75059,"y":-87.57142857142645},{"x":75311,"y":52.265306122446866},{"x":75814,"y":-32.77551020407952},{"x":76067,"y":132.18367346938354},{"x":76570,"y":47.14285714285714},{"x":77073,"y":-90.14285714286348},{"x":77325,"y":75.81632653061224},{"x":77827,"y":-8.22448979592259},{"x":78330,"y":-93.26530612244898},{"x":78582,"y":46.57142857142435},{"x":79084,"y":-37.46938775509993},{"x":79336,"y":128.48979591836522},{"x":80091,"y":-208.55102040816536},{"x":80094,"y":180.28571428571638},{"x":80849,"y":-156.75510204081422},{"x":81101,"y":9.204081632650949},{"x":81354,"y":174.16326530612454},{"x":82108,"y":-188.00000000000634},{"x":82360,"y":-22.04081632653061},{"x":82612,"y":143.91836734693456},{"x":83116,"y":57.87755102040605},{"x":83620,"y":-80.40816326530611},{"x":83872,"y":85.55102040815903},{"x":84375,"y":0.5102040816326531},{"x":84878,"y":-84.53061224490429},{"x":85130,"y":55.30612244897959},{"x":85632,"y":-28.734693877555245},{"x":86135,"y":-113.77551020408163},{"x":86387,"y":52.18367346938353},{"x":86889,"y":-57.97959183673258},{"x":87140,"y":108.97959183673468},{"x":87643,"y":23.938775510197747},{"x":88146,"y":-61.10204081632864},{"x":88397,"y":53.61224489795496},{"x":88901,"y":-32.42857142857354},{"x":89404,"y":-117.46938775509993},{"x":89656,"y":48.48979591836523},{"x":90159,"y":-62.67346938775299},{"x":90411,"y":103.28571428571217},{"x":90914,"y":18.244897959185785},{"x":91418,"y":-67.79591836735327},{"x":91669,"y":73.04081632653272},{"x":92173,"y":-13.000000000006334},{"x":92676,"y":-98.04081632653272},{"x":92928,"y":67.91836734693244},{"x":93430,"y":-42.244897959183675},{"x":93682,"y":123.71428571428149},{"x":94186,"y":37.67346938775299},{"x":94689,"y":-47.367346938773395},{"x":94941,"y":66.3469387755081},{"x":95443,"y":-17.693877551016183},{"x":95945,"y":-101.73469387755102},{"x":96197,"y":64.22448979591414},{"x":96699,"y":-45.93877551021253},{"x":97202,"y":-130.9795918367389},{"x":97454,"y":34.97959183672624},{"x":97706,"y":200.9387755101914},{"x":98460,"y":-161.22448979591837},{"x":98711,"y":5.73469387753835},{"x":99214,"y":-79.30612244898803},{"x":99466,"y":86.65306122447713},{"x":99967,"y":-48.63265306122871},{"x":100220,"y":116.3265306122449},{"x":100722,"y":32.285714285710064},{"x":101225,"y":-52.755102040816325},{"x":101477,"y":87.081632653057},{"x":101980,"y":2.0408163265306123},{"x":102483,"y":-82.99999999999578},{"x":102735,"y":82.95918367346938},{"x":103238,"y":-28.204081632648837},{"x":103741,"y":-113.24489795919634},{"x":103993,"y":52.714285714289936},{"x":104496,"y":-32.32653061225757},{"x":104748,"y":107.51020408163687},{"x":105252,"y":21.469387755097816},{"x":105754,"y":-62.57142857143702},{"x":106258,"y":-148.61224489795495},{"x":106261,"y":214.10204081631386},{"x":107014,"y":-120.93877551021252},{"x":107267,"y":44.02040816326108},{"x":107769,"y":-40.02040816327375},{"x":108021,"y":99.81632653059957},{"x":108524,"y":14.775510204073186},{"x":109028,"y":-71.26530612244476},{"x":109279,"y":95.69387755101195},{"x":109782,"y":-15.469387755106265},{"x":110285,"y":-100.51020408163265},{"x":110537,"y":65.44897959183251},{"x":111040,"y":-19.591836734693878},{"x":111543,"y":-156.87755102040393},{"x":111795,"y":9.081632653061224},{"x":112046,"y":176.04081632651793}]
},{}]},{},[4])