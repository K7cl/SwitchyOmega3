import { describe, it, expect } from 'vitest'
import { escapeSlash, shExp2RegExp } from '../src/shexp_utils.js'

describe('ShexpUtils', () => {
  describe('#escapeSlash', () => {
    it('should escape all forward slashes', () => {
      expect(escapeSlash('/test/')).toBe('\\/test\\/')
    })
    it('should not escape slashes that are already escaped', () => {
      expect(escapeSlash('\\/test\\/')).toBe('\\/test\\/')
    })
    it('should know the difference between escaped and unescaped slashes', () => {
      expect(escapeSlash('\\\\/\\/test\\/')).toBe('\\\\\\/\\/test\\/')
    })
  })
  describe('#shExp2RegExp', () => {
    it('should escape regex meta chars and back slashes', () => {
      expect(shExp2RegExp('this.is|a\\test+')).toBe('^this\\.is\\|a\\\\test\\+$')
    })
  })
})
