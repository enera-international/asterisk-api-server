/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectId } from 'mongodb'
import lodash from 'lodash'

export class ReactAdminConverter {
  reactAdminObjectIdPrefix = '$ObjectId:'
  toReactAdmin(data: any) {
    let result: any
    if (Array.isArray(data)) result = this.toReactAdminArray(data)
    else if (data instanceof Date) result = data
    else if (!(data instanceof ObjectId) && typeof data === 'object') result = this.toReactAdminObject(data)
    else {
      if (data instanceof ObjectId) result = this.reactAdminObjectIdPrefix + data.toHexString()
      else result = data
    }
    return result
  }
  toReactAdminObject(data: any) {
    const dataCopy = this.deepCopy(data)
    const isObjectId = (data: any): data is ObjectId => {
      return typeof data === 'object' && data instanceof ObjectId
    }
    for (const prop in dataCopy) {
      const propValue = dataCopy[prop]
      if (Array.isArray(propValue)) dataCopy[prop] = this.toReactAdminArray(propValue) as any
      else if (!isObjectId(propValue) && typeof propValue === 'object')
        dataCopy[prop] = this.toReactAdminObject(propValue) as any
      else if (isObjectId(propValue)) {
        dataCopy[prop] = this.reactAdminObjectIdPrefix + propValue.toHexString()
        if (prop === '_id') {
          dataCopy.id = dataCopy._id
          const d: { _id?: ObjectId } = dataCopy
          delete d._id
        }
      } else dataCopy[prop] = propValue
    }
    return dataCopy
  }
  toReactAdminArray(data: any) {
    return data.map((obj: any) => this.toReactAdmin(obj))
  }
  toMongoDB(data: any): any {
    let result: any
    if (Array.isArray(data)) result = this.toMongoDBArray(data)
    else if (data instanceof Date) result = data
    else if (typeof data === 'object') result = this.toMongoDBObject(data)
    else {
      if (typeof data === 'string' && data.indexOf(this.reactAdminObjectIdPrefix) === 0)
        result = new ObjectId(data.split(this.reactAdminObjectIdPrefix)[1])
      else result = data
    }
    return result
  }
  toMongoDBObject(data: any) {
    const dataCopy = this.deepCopy(data)
    const isString = (data: any): data is string => {
      return typeof data === 'string'
    }
    for (const prop in dataCopy) {
      const propValue = dataCopy[prop]
      if (Array.isArray(propValue)) dataCopy[prop] = this.toMongoDBArray(propValue) as any
      else if (typeof propValue === 'object') dataCopy[prop] = this.toMongoDBObject(propValue) as any
      else if (isString(propValue) && propValue.indexOf(this.reactAdminObjectIdPrefix) === 0) {
        dataCopy[prop] = new ObjectId(propValue.split(this.reactAdminObjectIdPrefix)[1]) as unknown as any
        if (prop === 'id') {
          dataCopy._id = dataCopy.id
          delete dataCopy.id
        }
      } else dataCopy[prop] = propValue
    }
    return dataCopy
  }
  toMongoDBArray(data: any[]) {
    return data.map((obj) => this.toMongoDB(obj))
  }
  deepCopy(obj: any): any {
    return lodash.cloneDeep(obj)
  }
}
