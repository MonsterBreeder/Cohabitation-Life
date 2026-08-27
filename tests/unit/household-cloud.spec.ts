import {
  HouseholdCloudError,
  confirmHouseholdInCloud,
  createHouseholdInCloud,
  getCurrentHouseholdInCloud,
  updateHouseholdInCloud,
  updateProfileInCloud,
  resetHouseholdCloudForTesting,
  setHouseholdCloudEnvironmentForTesting,
  setHouseholdCloudRuntimeForTesting,
  setHouseholdCloudTimeoutForTesting,
} from '../../src/services/household-cloud'

describe('household cloud service', () => {
  const init = jest.fn()
  const callFunction = jest.fn()
  const request = {
    requestId: 'request_12345678', operationToken: 'operation_12345678', name: '我们的小家',
    avatar: { kind: 'builtin' as const, id: 'household-01' as const },
  }

  beforeEach(() => {
    resetHouseholdCloudForTesting()
    init.mockReset()
    callFunction.mockReset()
    setHouseholdCloudEnvironmentForTesting('test-env')
    setHouseholdCloudRuntimeForTesting({ cloud: { init, callFunction } })
  })

  afterEach(resetHouseholdCloudForTesting)

  it('calls create, confirm and current-home query through the household function', async () => {
    callFunction.mockResolvedValue({ result: { status: 'NO_HOME', retryable: false } })
    await createHouseholdInCloud(request)
    await confirmHouseholdInCloud(request)
    await getCurrentHouseholdInCloud()
    await updateHouseholdInCloud({ name: '新家庭', avatar: { kind: 'builtin', id: 'household-02' } })
    await updateProfileInCloud({ nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } })
    expect(callFunction.mock.calls.map(([value]) => value.data.action)).toEqual(['create', 'confirm', 'get', 'updateHousehold', 'updateProfile'])
    expect(callFunction.mock.calls[2][0].data).toEqual({ action: 'get' })
  })

  it('rejects invalid nested household data', async () => {
    callFunction.mockResolvedValue({ result: { status: 'HOME', retryable: false, created: true, household: {}, profile: {} } })
    await expect(createHouseholdInCloud(request)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('distinguishes timeout from an explicit cloud failure', async () => {
    callFunction.mockImplementation(() => new Promise(() => undefined))
    setHouseholdCloudTimeoutForTesting(1)
    await expect(createHouseholdInCloud(request)).rejects.toMatchObject({ code: 'TIMEOUT' })

    callFunction.mockRejectedValueOnce({ errMsg: 'offline' })
    await expect(confirmHouseholdInCloud(request)).rejects.toEqual(expect.any(HouseholdCloudError))
  })
})
