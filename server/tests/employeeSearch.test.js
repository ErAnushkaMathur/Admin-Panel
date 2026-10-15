import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { startTestServer } from './helpers/testServer.js'

// GET /employees?search= — what the Employees page search box and the top-bar staff search use
let t, owner, ownerB, manager
const ids = {}
const req = (path, token = owner.token) => t.request('GET', path, { token })
const names = (res) => res.body.employees.map((e) => e.name)

before(async () => {
  t = await startTestServer()
  owner = await t.registerOwner('Alpha')
  ownerB = await t.registerOwner('Beta')
  const post = (path, body, token = owner.token) => t.request('POST', path, { token, body })
  ids.kitchen = (await post('/departments', { name: 'Kitchen', color: '#c5124f', icon: 'chef-hat' })).body.department._id
  ids.counter = (await post('/departments', { name: 'Counter', color: '#15745c', icon: 'store' })).body.department._id
  const shift = (await post('/shifts', { name: 'Morning', startTime: '09:00', endTime: '17:00', graceMinutes: 10 })).body.shift._id
  const add = async (name, phone, departmentId, roleTitle, token = owner.token) => {
    const res = await post('/employees', { name, phone, departmentId, roleTitle, shiftId: shift, joinDate: '2026-01-01', salary: { type: 'monthly', amountPaise: 1_000_000 } }, token)
    assert.equal(res.status, 201, JSON.stringify(res.body))
    return res.body.employee
  }
  ids.ramesh = await add('Ramesh Kumar', '9876543210', ids.kitchen, 'Halwai')
  ids.suresh = await add('Suresh Patel', '9123456780', ids.counter, 'Cashier')
  ids.rani = await add('Rani Sharma', '9000011111', ids.kitchen, 'Helper')
  ids.mohan = await add('Mohan Das', '9000022222', ids.counter, 'Halwai')
  await t.request('PATCH', `/employees/${ids.mohan._id}`, { token: owner.token, body: { isActive: false } })
  // Another shop's employee with a matching name must never show up
  const otherDept = (await post('/departments', { name: 'Kitchen', color: '#c5124f', icon: 'chef-hat' }, ownerB.token)).body.department._id
  const otherShift = (await post('/shifts', { name: 'Morning', startTime: '09:00', endTime: '17:00', graceMinutes: 10 }, ownerB.token)).body.shift._id
  await post('/employees', { name: 'Ramesh Other', phone: '9555555555', departmentId: otherDept, roleTitle: 'Halwai', shiftId: otherShift, joinDate: '2026-01-01', salary: { type: 'monthly', amountPaise: 1_000_000 } }, ownerB.token)

  await t.mongoose.model('User').create({ businessId: owner.businessId, name: 'Mona', email: 'mona@alpha.test', passwordHash: await bcrypt.hash('secret123', 4), role: 'manager' })
  manager = { token: (await t.request('POST', '/auth/login', { body: { email: 'mona@alpha.test', password: 'secret123' } })).body.token }
})
after(async () => t?.stop())

describe('employee search', () => {
  test('by part of the name, any case', async () => {
    assert.deepEqual(names(await req('/employees?search=ram')), ['Ramesh Kumar'])
    assert.deepEqual(names(await req('/employees?search=RANI')), ['Rani Sharma'])
    assert.deepEqual(names(await req('/employees?search=sh')).sort(), ['Ramesh Kumar', 'Rani Sharma', 'Suresh Patel'])
  })

  test('by employee code, role and phone (digits, spaces ignored)', async () => {
    assert.deepEqual(names(await req(`/employees?search=${ids.suresh.employeeCode}`)), ['Suresh Patel'])
    assert.deepEqual(names(await req('/employees?search=halwai')), ['Mohan Das', 'Ramesh Kumar'])
    assert.deepEqual(names(await req(`/employees?search=${encodeURIComponent('98765 432')}`)), ['Ramesh Kumar'])
  })

  test('surrounding spaces are trimmed; an empty search lists everyone', async () => {
    assert.deepEqual(names(await req(`/employees?search=${encodeURIComponent('  suresh  ')}`)), ['Suresh Patel'])
    assert.equal((await req('/employees?search=')).body.total, 4)
  })

  test('combines with department and status filters', async () => {
    assert.deepEqual(names(await req(`/employees?search=halwai&status=active`)), ['Ramesh Kumar'])
    assert.deepEqual(names(await req(`/employees?search=halwai&status=inactive`)), ['Mohan Das'])
    assert.deepEqual(names(await req(`/employees?search=a&departmentId=${ids.counter}`)).sort(), ['Mohan Das', 'Suresh Patel'])
  })

  test('total counts every match, not just the page', async () => {
    const res = await req('/employees?search=a&limit=2&page=1')
    assert.equal(res.body.employees.length, 2)
    assert.equal(res.body.total, 4)
  })

  test('special characters are matched literally', async () => {
    assert.equal((await req(`/employees?search=${encodeURIComponent('.*')}`)).body.total, 0)
    assert.equal((await req(`/employees?search=${encodeURIComponent('(')}`)).status, 200)
  })

  test('managers can search; other shops never match', async () => {
    assert.deepEqual(names(await req('/employees?search=ramesh', manager.token)), ['Ramesh Kumar'])
    assert.deepEqual(names(await req('/employees?search=ramesh', ownerB.token)), ['Ramesh Other'])
  })

  test('too long a search is rejected', async () => {
    assert.equal((await req(`/employees?search=${'x'.repeat(61)}`)).status, 400)
  })
})
