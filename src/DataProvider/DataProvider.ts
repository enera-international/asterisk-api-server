/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { AddChildNodeParams, AddRootNodeParams, CreateParams, DeleteBranchParams, DeleteBranchResult, DeleteManyParams, DeleteParams, GetChildNodesParams, GetListParams, GetListResult, GetManyParams, GetManyReferenceParams, GetManyReferenceResult, GetOneParams, GetParentNodeParams, GetRootNodesParams, GetTreeParams, IDataProvider, Identifier, MoveAsNthChildOfParams, MoveAsNthSiblingOfOfParams, RaRecord, TreeRecord, UpdateManyParams, UpdateParams } from "./DataProviderTypes.js"
import { Collection, MongoClient, Document, ObjectId, WithId, Db } from 'mongodb'
import lodash from 'lodash'
import mqtt from 'mqtt'
import { Event, GetLocksParams, SubscriptionCallback } from "./ra-realtime-types.js"
import { ReactAdminConverter } from "./react-admin-converter.js"

export interface CollectionDefinition {
    name: string
}

const defaultDataProviderOptions: DataProviderOptions = {
    dbName: '',
    mongoDbUrl: 'mongodb://localhost:27017',
    mqttUrl: 'mqtt://localhost:1883',
    mqttPrefix: 'emellio/react-admin',
}

export type DataProviderOptions = {
    dbName?: string;
    mongoDbUrl?: string;
    mqttUrl?: string;
    mqttPrefix?: string;
}

export const mqttPrefix = 'emellio'

export class DataProvider<ResourceType extends string = string> implements IDataProvider<ResourceType> {
    dbs: { [resource: string]: Collection<Document> } = {}
    mongoDbClient?: MongoClient
    readyFlag = false
    parentIdField = 'parent_id'
    positionField = 'position'
    db?: Db
    mqttClient?: mqtt.MqttClient
    converter = new ReactAdminConverter()
    constructor(public options?: DataProviderOptions) {
        this.options = { ...defaultDataProviderOptions, ...this.options }
        this.init()
    }
    async waitReady() {
        for (; !this.readyFlag;) {
            await new Promise(res => setTimeout(res, 1000))
        }
    }
    async init() {
        if (this.options?.mqttUrl) {
            this.mqttClient = mqtt.connect(this.options.mqttUrl)
            this.mqttClient.on("message", (topic, message) => {
                const index = topic.indexOf(mqttPrefix)
                if (index === 0) {
                    const event = JSON.parse(message.toString())
                    this.onMqttEvent(event)
                }
            })
        }
        if (this.options?.mongoDbUrl) {
            this.mongoDbClient = new MongoClient(this.options.mongoDbUrl)
            await this.mongoDbClient.connect()
            if (this.options.dbName)
                this.db = this.mongoDbClient.db(this.options.dbName)
        }
        this.readyFlag = true
    }
    checkResource(name: string) {
        if (this.db) {
            if (!this.dbs[name])
                this.dbs[name] = this.db.collection(name)
        } else {
            if (this.options?.dbName)
                throw (new Error(`Database ${this.options.dbName} not open`))
            else
                throw (new Error(`No database name defined`))
        }
    }
    async close() {
        await this.waitReady()
        await this.mongoDbClient?.close()
        await this.mqttClient?.endAsync()
    }
    async getList<RecordType extends RaRecord = any>(resource: ResourceType, params: Partial<GetListParams> = { pagination: { page: 1, perPage: 10 }, filter: {}, sort: { field: 'id', order: 'ASC' } }): Promise<GetListResult<RecordType>> {
        this.checkResource(resource)
        const result = await this.getListByField(resource, { id: '', target: 'id', ...params })
        return { data: result.data, total: result.total }
    }
    async getListByField<RecordType extends RaRecord = any>(resource: ResourceType, params: Partial<GetManyReferenceParams>): Promise<GetManyReferenceResult<RecordType>> {
        this.checkResource(resource)
        const target = (params.target === 'id') ? '_id' : params.target
        let from = 0
        let to = 0
        if (params?.pagination && params.pagination.page >= 1) {
            from = (params.pagination.page - 1) * params.pagination.perPage
            to = from + params.pagination.perPage
        }
        let sortField
        let sortOrder
        if (params?.sort) {
            sortField = params.sort.field
            sortOrder = params.sort.order
        }
        const filter = this.converter.toMongoDB(params.filter) as { [index: string]: any, q?: string, name?: string | RegExp }
        let query = filter ? filter : {}
        if (query?.q) {
            let q = query.q.replace(
                /&&/g,
                '&'
            )
            q = q.replace(/\|\|/g, '&')
            const andStrings = (q.split(
                '&'
            ) as string[]).map((s) => s.trim())
            const ands = andStrings.map(
                (value) => ({
                    and: value,
                    ors: [] as string[],
                    regexp: '',
                })
            )
            for (const and of ands) {
                and.ors = and.and
                    .split('|')
                    .map((s) => s.trim())
                and.regexp = and.ors.reduce(
                    (acc, value) => {
                        acc = acc
                            ? acc.concat(
                                '|' + `${value}`
                            )
                            : acc.concat(`${value}`)
                        return acc
                    }
                )
            }
            const expr = ands.reduce(
                (acc, value) =>
                    acc.concat(
                        '(?=.*' + value.regexp + ')'
                    ),
                ''
            )
            {
                // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
                const { q, ...skipQ } = query
                query = { ...skipQ, message: new RegExp(expr, 'i') }
            }
        }
        for (const prop in query) {
            if (prop !== 'q' && typeof query[prop] === 'string') {
                query[prop] = new RegExp(query[prop], 'i')
            } else if (Array.isArray(query[prop])) {
                query[prop] = { $in: query[prop] }
            }
        }
        if (params.id) {
            query[target] = new ObjectId(params.id)
        }
        const total = await this.dbs[resource].countDocuments(query)
        let cursor = this.dbs[resource].find(query)
        if (from !== to) {
            cursor = cursor
                .skip(from)
                .limit(to - from)
        }
        if (sortField && sortOrder) {
            cursor = cursor.sort({
                [sortField!]:
                    sortOrder === 'ASC'
                        ? 1
                        : -1,
            })
        }
        const dbData = await cursor.toArray()
        const data = this.converter.toReactAdmin(dbData)
        const pageInfo = {
            hasNextPage: to < total,
            hasPreviousPage: from > 1
        }
        return { data, total, pageInfo }
    }
    async getOne<RecordType extends RaRecord<Identifier> = any>(resource: ResourceType, params: GetOneParams<RecordType>) {
        this.checkResource(resource)
        const cursor = this.dbs[resource].find({ _id: this.converter.toMongoDB(params.id) })
        const dataArray = await cursor.toArray()
        const data = (dataArray.length === 1) ? this.converter.toReactAdmin(dataArray[0]) : null
        return { data }
    }
    async getMany<RecordType extends RaRecord<Identifier> = any>(resource: ResourceType, params: GetManyParams) {
        this.checkResource(resource)
        const ids = params.ids.map(id => this.converter.toMongoDB(id))
        const cursor = this.dbs[resource].find({ _id: { $in: ids } })
        const mdata = await cursor.toArray()
        const data = this.converter.toReactAdmin(mdata) as RecordType[]
        return { data }
    }
    async getManyReference<RecordType extends RaRecord<Identifier> = any>(resource: ResourceType, params: GetManyReferenceParams) {
        this.checkResource(resource)
        const result = await this.getListByField(resource, params)
        return result
    }
    async update<RecordType extends RaRecord<Identifier> = any>(resource: ResourceType, params: UpdateParams<any>) {
        let data: RecordType
        this.checkResource(resource)
        const paramsData = this.converter.toMongoDB(params.data)
        const previous = await this.dbs[resource].findOne({ _id: this.converter.toMongoDB(params.id) })
        if (previous && lodash.isEqual(params.previousData, this.converter.toReactAdmin(previous))) {
            const updateResult = await this.dbs[resource].updateOne({ _id: this.converter.toMongoDB(params.id) }, { $set: paramsData })
            if (updateResult.modifiedCount === 1) {
                await this.addEvent(resource, 'update', paramsData)
                const dataAfter = await this.getOne(resource, { id: params.id })
                data = dataAfter.data
            } else
                throw (new Error('Update failed'))
        } else
            throw (new Error('Update failed - previous data has been updated on the server'))
        return { data }
    }
    async updateMany<RecordType extends RaRecord<Identifier> = any>(resource: ResourceType, params: UpdateManyParams<any>) {
        this.checkResource(resource)
        const ids = params.ids.map(id => this.converter.toMongoDB(id))
        const updateResult = await this.dbs[resource].updateMany({ _id: { $in: ids } }, { $set: params.data })
        await this.addEvent(resource, 'updateMany', { data: params.data, ids })
        let data: Identifier[]
        if (updateResult.modifiedCount === params.ids.length)
            data = params.ids
        else
            data = []
        return { data }
    }
    async addEvent(resource: ResourceType, action: string, payload: unknown) {
        this.checkResource('events')
        this.mqttClient?.publishAsync(mqttPrefix + '/' + resource, JSON.stringify({ action, payload }))
        await this.dbs['events'].insertOne({
            date: (new Date()).toISOString(),
            author: {
                id: 567,
                fullName: 'John Doe',
                avatar: 'https://myavatar.com',
            },
            resource,
            action,
            payload
        })
    }
    async create<RecordType extends Omit<RaRecord<Identifier>, "id"> = any, ResultRecordType extends RaRecord<Identifier> = RecordType & any>(resource: ResourceType, params: CreateParams<any>) {
        this.checkResource(resource)
        const dbData = this.converter.toMongoDB(params.data)
        const response = await this.dbs[resource].insertOne(dbData)
        const data: ResultRecordType = { ...params.data, id: this.converter.toReactAdmin(response.insertedId) } as ResultRecordType
        await this.addEvent(resource, 'create', data)
        return { data }
    }
    async delete<RecordType extends RaRecord<Identifier> = any>(resource: ResourceType, params: DeleteParams<RecordType>) {
        this.checkResource(resource)
        const existingData = await this.dbs[resource].findOne({ _id: new ObjectId(params.id) })
        await this.addEvent(resource, 'delete', existingData)
        const response = await this.dbs[resource].deleteOne({ _id: new ObjectId(params.id) })
        let data
        if (existingData && response.acknowledged && response.deletedCount === 1)
            data = this.converter.toReactAdmin(existingData)
        else
            throw (new Error('delete failed'))
        return { data }
    }
    async deleteMany<RecordType extends RaRecord<Identifier> = any>(resource: ResourceType, params: DeleteManyParams<RecordType>) {
        this.checkResource(resource)
        const ids = params.ids.map(id => this.converter.toMongoDB(id as string))
        const response = await this.dbs[resource].deleteMany({ _id: { $in: ids } })
        for (const id of ids)
            await this.addEvent(resource, 'deleteMany', id)
        let data: RecordType['id'][]
        if (response.acknowledged && response.deletedCount === params.ids.length)
            data = this.converter.toReactAdmin(params.ids)
        else
            data = []
        return { data }
    }
    subscriptions?: { topic: string, subscriptionCallback: (event: Event) => any }[] = []
    onMqttEvent(event: Event) {
        this.subscriptions?.forEach(async subscription => {
            if (subscription.topic === event.topic)
                subscription.subscriptionCallback(event)
        })
    }
    async subscribe(topic: string, subscriptionCallback: SubscriptionCallback): Promise<any> {
        if (!topic) {
            return Promise.reject(new Error('missing topic'))
        }
        const fullTopic = mqttPrefix + '/' + topic
        await this.mqttClient?.subscribeAsync(fullTopic)
        this.subscriptions?.push({ topic, subscriptionCallback })
        return { data: null }
    }
    async unsubscribe(topic: string, subscriptionCallback: SubscriptionCallback): Promise<any> {
        if (!topic) {
            return Promise.reject(new Error('missing topic'))
        }
        await this.mqttClient?.unsubscribeAsync(mqttPrefix + '/' + topic)
        this.subscriptions = this.subscriptions?.filter(
            subscription =>
                subscription.topic !== topic ||
                subscription.subscriptionCallback !== subscriptionCallback
        )
        return { data: null }
    }
    async publish(topic: string, event: Event): Promise<any> {
        if (!topic) {
            return Promise.reject(new Error('missing topic'))
        }
        if (!event.type) {
            return Promise.reject(new Error('missing event type'))
        }
        event.topic = topic
        await this.mqttClient?.publishAsync(mqttPrefix + '/' + topic, JSON.stringify(event))
        return { data: null }
    }
    locksRessourceName: ResourceType = 'locks' as any
    publishEvents?: boolean = true
    async lock(resource: ResourceType, params: any): Promise<any> {
        this.checkResource(resource)
        const { id: recordId, identity, meta } = params
        const createdAt = new Date()

        const { data: existingLocks, total } = await this.getList(
            this.locksRessourceName,
            {
                pagination: { page: 1, perPage: 1 },
                sort: { field: 'id', order: 'ASC' },
                filter: {
                    resource,
                    recordId,
                },
            }
        )

        if (total && total > 0) {
            if (existingLocks[0].identity === identity) {
                return Promise.resolve({ data: existingLocks[0] })
            } else {
                return Promise.reject(new Error('Locked by someone else'))
            }
        }

        const res = await this.create<Lock & RaRecord>(
            this.locksRessourceName,
            {
                data: {
                    identity,
                    resource,
                    recordId,
                    createdAt,
                },
                meta,
            }
        )

        if (this.publishEvents) {
            // wait for 100 milliseconds before publishing events
            await new Promise(resolve =>
                setTimeout(() => resolve(res), 100)
            )
            await Promise.all([
                this.publish(`lock/${resource}/${recordId}`, {
                    type: 'created',
                    payload: { ids: [res.data.id] },
                    date: Date.now(),
                }),
                this.publish(`lock/${resource}`, {
                    type: 'created',
                    payload: { ids: [res.data.id] },
                    date: Date.now(),
                }),
            ])
        }
        return res
    }
    async unlock(resource: ResourceType, params: any): Promise<any> {
        this.checkResource(resource)
        const { id: recordId, identity, meta } = params

        const { data: locks, total } = await this.getList(
            this.locksRessourceName,
            {
                pagination: { page: 1, perPage: 1 },
                sort: { field: 'id', order: 'ASC' },
                filter: {
                    resource,
                    recordId,
                },
                meta,
            }
        )

        if (total === 0) {
            return Promise.reject(new Error('No existing lock'))
        }

        if (locks[0].identity !== identity) {
            return Promise.reject(new Error('Cannot unlock'))
        }

        const currentLock = locks[0]
        const res = await this.delete(this.locksRessourceName, {
            id: currentLock.id,
            previousData: {
                ...currentLock,
            },
            meta,
        })
        if (this.publishEvents) {
            // wait for 100 milliseconds before publishing events
            await new Promise(resolve =>
                setTimeout(() => resolve(res), 100)
            )
            await Promise.all([
                this.publish(
                    `lock/${resource}/${currentLock.recordId}`,
                    {
                        type: 'deleted',
                        payload: { ids: [currentLock.recordId] },
                        date: Date.now(),
                    }
                ),
                this.publish(`lock/${resource}`, {
                    type: 'deleted',
                    payload: { ids: [currentLock.recordId] },
                    date: Date.now(),
                }),
            ])
        }
        return res
    }
    async getLock(resource: ResourceType, params: any): Promise<any> {
        this.checkResource(resource)
        const { id: recordId, meta } = params

        const { data: locks, total } = await this.getList<
            Lock & RaRecord
        >(this.locksRessourceName, {
            pagination: { page: 1, perPage: 1 },
            sort: { field: 'id', order: 'ASC' },
            filter: {
                resource,
                recordId,
            },
            meta,
        })

        if (total === 0) {
            return Promise.resolve({ data: undefined })
        }
        return Promise.resolve({ data: locks[0] })
    }
    async getLocks(resource: ResourceType, params: GetLocksParams): Promise<any> {
        this.checkResource(resource)
        const { meta } = params
        return this.getList<Lock & RaRecord>(this.locksRessourceName, {
            // "pagination" and "sort" field are required by getList
            pagination: { page: 1, perPage: 1000 },
            sort: { field: 'id', order: 'ASC' },
            filter: {
                resource,
            },
            meta,
        })
    }

    async getTree(resource: ResourceType, params?: GetTreeParams) {
        this.checkResource(resource)
        // get all records
        const { data } = await this.getList(resource, {
            filter: {},
            sort: { field: this.positionField, order: 'ASC' },
            pagination: { page: 1, perPage: 1000 },
            meta: params?.meta,
        })
        // fill children for each record
        // FIXME o(n2)
        const treeRecords = data.map(record => ({
            ...record,
            children: data
                // eslint-disable-next-line eqeqeq
                .filter(r => r[this.parentIdField] == record.id)
                .sort((a, b) => a[this.positionField] - b[this.positionField])
                .map(child => child.id),
        }))
        return {
            data: treeRecords,
        }
    }

    async getRootNodes(resource: ResourceType, params: GetRootNodesParams) {
        this.checkResource(resource)
        // get root records
        const { data } = await this.getList(resource, {
            filter: { [this.parentIdField]: null },
            sort: { field: this.positionField, order: 'ASC' },
            pagination: { page: 1, perPage: 1000 },
            meta: params?.meta,
        })
        // fill children for each record
        const treeRecords = await Promise.all(
            data.map(record =>
                this
                    .getList(resource, {
                        filter: { [this.parentIdField]: record.id },
                        sort: {
                            field: this.positionField,
                            order: 'ASC',
                        },
                        pagination: { page: 1, perPage: 1000 },
                        meta: params?.meta,
                    })
                    .then(({ data }) => ({
                        ...record,
                        children: data.map(({ id }) => id),
                    }))
            )
        )
        return {
            data: treeRecords,
        }
    }

    async getParentNode<RecordType extends TreeRecord = TreeRecord>(resource: ResourceType, params: GetParentNodeParams<RecordType>) {
        this.checkResource(resource)
        const { data: tree } = await this.getTree(
            resource,
            { meta: params.meta }
        )
        const child = tree.find(node => node.id === params.childId)

        if (!child) {
            return { data: {} as RecordType }
        }

        const parent = tree.find(node => node.id === child[this.parentIdField])

        return {
            data: parent ? parent : {} as RecordType,
        }
    }

    async getChildNodes(resource: ResourceType, { parentId, meta }: GetChildNodesParams) {
        this.checkResource(resource)
        // get child records
        const { data } = await this.getList(resource, {
            filter: { [this.parentIdField]: parentId },
            sort: { field: this.positionField, order: 'ASC' },
            pagination: { page: 1, perPage: 1000 },
            meta,
        })
        // fill children for each record
        const treeRecords = await Promise.all(
            data.map(record =>
                this
                    .getList(resource, {
                        filter: { [this.parentIdField]: record.id },
                        sort: {
                            field: this.positionField,
                            order: 'ASC',
                        },
                        pagination: { page: 1, perPage: 1000 },
                        meta,
                    })
                    .then(({ data }) => ({
                        ...record,
                        children: data.map(({ id }) => id),
                    }))
            )
        )
        return {
            data: treeRecords,
        }
    }

    async moveAsNthChildOf(
        resource: ResourceType,
        { source, destination, position, meta }: MoveAsNthChildOfParams
    ) {
        this.checkResource(resource)
        // 1. Increment the position of all destination child nodes after the position
        const destinationSiblings = (
            await this.getList(resource, {
                filter: {
                    [this.parentIdField]: destination.id,
                    [`${this.positionField}_gte`]: position,
                },
                sort: {
                    field: this.positionField,
                    order: 'ASC',
                },
                pagination: { page: 1, perPage: 1000 },
                meta,
            })
        ).data
        if (destinationSiblings.length > 0) {
            await Promise.all(
                destinationSiblings.map(item =>
                    this.update(resource, {
                        id: item.id,
                        data: { [this.positionField]: item[this.positionField] + 1 },
                        previousData: item,
                        meta,
                    })
                )
            )
        }
        // 2. Decrement the position of all nodes after the source node
        const sourceSiblings = (
            await this.getList(resource, {
                filter: {
                    [this.parentIdField]: source[this.parentIdField],
                    [`${this.positionField}_gt`]: source[this.positionField],
                },
                sort: {
                    field: this.positionField,
                    order: 'ASC',
                },
                pagination: { page: 1, perPage: 1000 },
                meta,
            })
        ).data
        if (sourceSiblings.length > 0) {
            await Promise.all(
                sourceSiblings.map(item =>
                    this.update(resource, {
                        id: item.id,
                        data: { [this.positionField]: item[this.positionField] - 1 },
                        previousData: item,
                        meta,
                    })
                )
            )
        }
        // 3. Change the parent and position of the source node
        await this.update(resource, {
            id: source.id,
            data: {
                [this.parentIdField]: destination.id,
                [this.positionField]: position,
            },
            previousData: source,
            meta,
        })
        return { data: undefined }
    }

    async moveAsNthSiblingOf(
        resource: ResourceType,
        { source, destination, position, meta }: MoveAsNthSiblingOfOfParams
    ) {
        this.checkResource(resource)
        // 1. Increment the position of all nodes after the destination
        let destinationSiblingsToUpdateFilter
        if (position === 0) {
            destinationSiblingsToUpdateFilter = {
                [this.parentIdField]: destination[this.parentIdField],
            }
        }
        if (
            source[this.positionField] > destination[this.positionField] &&
            source[this.parentIdField] === destination[this.parentIdField]
        ) {
            destinationSiblingsToUpdateFilter = {
                [this.parentIdField]: destination[this.parentIdField],
                [`${this.positionField}_gt`]: destination[this.positionField],
            }
        }
        if (
            source[this.parentIdField] !== destination[this.parentIdField] &&
            position > 0
        ) {
            destinationSiblingsToUpdateFilter = {
                [this.parentIdField]: destination[this.parentIdField],
                [`${this.positionField}_gt`]: destination[this.positionField],
            }
        }
        if (destinationSiblingsToUpdateFilter) {
            const { data: destinationSiblings } =
                await this.getList(resource, {
                    filter: destinationSiblingsToUpdateFilter,
                    sort: {
                        field: this.positionField,
                        order: 'ASC',
                    },
                    pagination: { page: 1, perPage: 1000 },
                    meta,
                })

            if (destinationSiblings.length > 0) {
                await Promise.all<unknown>(
                    destinationSiblings.map(item =>
                        item.id === source.id
                            ? Promise.resolve(undefined)
                            : this.update(resource, {
                                id: item.id,
                                data: {
                                    [this.positionField]:
                                        item[this.positionField] + 1,
                                },
                                previousData: item,
                                meta,
                            })
                    )
                )
            }
        }
        // 2. Decrement the position of all nodes after the source node
        let sourceSiblingsToUpdateFilters

        if (source[this.parentIdField] === destination[this.parentIdField]) {
            if (source[this.positionField] > destination[this.positionField]) {
                sourceSiblingsToUpdateFilters = {
                    [this.parentIdField]: source[this.parentIdField],
                    [`${this.positionField}_gt`]: source[this.positionField],
                }
            } else {
                sourceSiblingsToUpdateFilters = {
                    [this.parentIdField]: source[this.parentIdField],
                    [`${this.positionField}_gt`]: source[this.positionField],
                    [`${this.positionField}_lte`]: destination[this.positionField],
                }
            }
        } else {
            sourceSiblingsToUpdateFilters = {
                [this.parentIdField]: source[this.parentIdField],
                [`${this.positionField}_gt`]: source[this.positionField],
            }
        }
        const sourceSiblings = (
            await this.getList(resource, {
                filter: sourceSiblingsToUpdateFilters,
                sort: {
                    field: this.positionField,
                    order: 'ASC',
                },
                pagination: { page: 1, perPage: 1000 },
                meta,
            })
        ).data
        if (sourceSiblings.length > 0) {
            await Promise.all(
                sourceSiblings.map(item =>
                    item.id === source.id
                        ? Promise.resolve(undefined)
                        : this.update(resource, {
                            id: item.id,
                            data: {
                                [this.positionField]: item[this.positionField] - 1,
                            },
                            previousData: item,
                            meta,
                        })
                )
            )
        }
        // 3. Change the parent and position of the source node
        await this.update(resource, {
            id: source.id,
            data: {
                [this.parentIdField]: destination[this.parentIdField],
                [this.positionField]:
                    source[this.parentIdField] === destination[this.parentIdField]
                        ? source[this.positionField] > destination[this.positionField]
                            ? destination[this.positionField] + 1
                            : destination[this.positionField]
                        : position,
            },
            previousData: source,
            meta,
        })
        return { data: undefined }
    }

    async addRootNode(resource: ResourceType, { data, meta }: AddRootNodeParams) {
        this.checkResource(resource)
        // get root records to compute position
        const { data: roots } = await this.getList(resource, {
            filter: { [this.parentIdField]: null },
            sort: { field: this.positionField, order: 'ASC' },
            pagination: { page: 1, perPage: 1000 },
            meta,
        })
        const rootPosition =
            roots.length > 0
                ? roots.reduce(
                    (acc, curr) =>
                        curr[this.positionField] > acc
                            ? curr[this.positionField]
                            : acc,
                    -Infinity
                ) + 1
                : 0
        const { data: newRoot } = await this.create(resource, {
            data: {
                ...data,
                [this.parentIdField]: null,
                [this.positionField]: rootPosition,
            },
            meta,
        })
        return { data: { ...newRoot, children: [] } }
    }

    async addChildNode(resource: ResourceType, { parentId, data, meta }: AddChildNodeParams) {
        this.checkResource(resource)
        // get child records to compute position
        const { data: siblings } = await this.getList(resource, {
            filter: { [this.parentIdField]: parentId },
            sort: { field: this.positionField, order: 'ASC' },
            pagination: { page: 1, perPage: 1000 },
            meta,
        })
        const childPosition =
            siblings.length > 0
                ? siblings.reduce(
                    (acc, curr) =>
                        curr[this.positionField] > acc
                            ? curr[this.positionField]
                            : acc,
                    -Infinity
                ) + 1
                : 0
        const { data: newRoot } = await this.create(resource, {
            data: {
                ...data,
                [this.parentIdField]: parentId,
                [this.positionField]: childPosition,
            },
            meta,
        })
        return { data: { ...newRoot, children: [] } }
    }

    async deleteBranch<RecordType extends TreeRecord = TreeRecord>(
        resource: ResourceType,
        params: DeleteBranchParams
    ) {
        this.checkResource(resource)
        const { id, previousData, meta } = params
        // Deletion of the record itself must be handled by specialized method.
        await this.deleteBranchByDeletingAllChildren(resource, params)

        // However, we must update the node siblings position.

        // get the siblings
        const { data: siblings } =
            await this.getChildNodes(resource, {
                parentId: previousData![this.parentIdField],
                meta,
            })

        // update the siblings position
        await Promise.all(
            siblings
                .filter(
                    node =>
                        node[this.positionField] > previousData![this.positionField] &&
                        node.id !== id
                )
                .map(node =>
                    this.update(resource, {
                        id: node.id,
                        data: {
                            ...node,
                            [this.positionField]: node[this.positionField] - 1,
                        },
                        previousData: node,
                        meta,
                    })
                )
        )

        return { data: previousData! }
    }
    async deleteBranchByDeletingAllChildren(resource: ResourceType, params: DeleteBranchParams): Promise<DeleteBranchResult> {
        const deleteBranch = async (params: DeleteBranchParams) => {
            this.checkResource(resource)
            // Get the node children
            const { data: children } = await this.getChildNodes(
                resource,
                {
                    parentId: params.id,
                    meta: params.meta,
                }
            )

            if (children.length > 0) {
                // Recursively delete all the node children
                await Promise.all(
                    children.map(child =>
                        deleteBranch({
                            id: child.id,
                            //data: child,
                            meta: params.meta,
                        })
                    )
                )
            }

            // Delete the node
            await this.delete(resource, params)
        }

        await deleteBranch(params)

        return { data: params.previousData! }
    }
    /* Extended methods in addition to react-admin DataProvider ifc */
    async createOne<RecordType extends Omit<RaRecord<Identifier>, "id"> = any, ResultRecordType extends RaRecord<Identifier> = RecordType & any>(resource: ResourceType, data: RecordType) {
        return this.create(resource, { data })
    }
    async createMany<RecordType extends Omit<RaRecord<Identifier>, "id"> = any, ResultRecordType extends RaRecord<Identifier> = RecordType & any>(resource: ResourceType, data: RecordType[]) {
        this.checkResource(resource)
        const response = await this.dbs[resource].insertMany(this.converter.toMongoDB(data) as [])
        const result = { ids: Object.values(response.insertedIds as { [key: string]: ObjectId }).map(id => this.converter.toReactAdmin(id)) }
        await this.addEvent(resource, 'create', data)
        return { data: result }
    }
}
