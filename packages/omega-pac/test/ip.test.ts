import { describe, it, expect } from 'vitest'
import { parse } from '../src/ip.js'

describe('ip', () => {
  it('parses IPv4 with a CIDR prefix', () => {
    const a = parse('192.168.1.1/16')!
    expect(a).not.toBeNull()
    expect(a.v4).toBe(true)
    expect(a.correctForm()).toBe('192.168.1.1')
    expect(a.subnetMask).toBe(16)
    expect(a.subnet).toBe('/16')
  })

  it('defaults the prefix to a full mask', () => {
    expect(parse('127.0.0.1')!.subnetMask).toBe(32)
    expect(parse('::1')!.subnetMask).toBe(128)
    expect(parse('::1')!.addressMinusSuffix).toBe('::1')
  })

  it('computes the IPv4 netmask via startAddress', () => {
    expect(parse('255.255.255.255/16')!.startAddress().correctForm()).toBe('255.255.0.0')
  })

  it('compresses IPv6 per RFC 5952', () => {
    expect(parse('0:0::1')!.correctForm()).toBe('::1')
    expect(parse('fefe:0013:0000:0000:0000:0000:0000:0abc')!.correctForm()).toBe('fefe:13::abc')
    expect(parse('::')!.correctForm()).toBe('::')
    expect(parse('::ffff:eeee')!.correctForm()).toBe('::ffff:eeee')
  })

  it('computes the IPv6 netmask for /33', () => {
    const max = parse('::/0')!.endAddress().canonicalForm()
    expect(parse(max + '/33')!.startAddress().correctForm()).toBe('ffff:ffff:8000::')
  })

  it('rejects malformed input and out-of-range prefixes', () => {
    expect(parse('foo/-233')).toBeNull()
    expect(parse('nonsense stuff')).toBeNull()
    expect(parse('0.0.0.0/-233')).toBeNull()
    expect(parse('256.1.1.1')).toBeNull()
    expect(parse('1.2.3')).toBeNull()
    expect(parse('192.168.0.0/33')).toBeNull()
  })

  it('tests subnet containment', () => {
    expect(parse('192.168.4.4')!.isInSubnet(parse('192.168.1.1/16')!)).toBe(true)
    expect(parse('10.0.0.1')!.isInSubnet(parse('192.168.1.1/16')!)).toBe(false)
    expect(parse('fefe:13::def')!.isInSubnet(parse('fefe:13::abc/33')!)).toBe(true)
  })
})
