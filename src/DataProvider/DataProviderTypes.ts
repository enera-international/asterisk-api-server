/* eslint-disable @typescript-eslint/no-explicit-any */

export type Identifier = string | number

export interface RaRecord<IdentifierType extends Identifier = Identifier>
    extends Record<string, any> {
    id?: IdentifierType;
    _id?: IdentifierType;
}

export interface SortPayload {
    field: string;
    order: 'ASC' | 'DESC';
}
export interface FilterPayload {
    [k: string]: any;
}
export interface PaginationPayload {
    page: number;
    perPage: number;
}
export type ValidUntil = Date
/**
 * i18nProvider types
 */
export abstract class IDataProvider<ResourceType extends string = string> {
    abstract getList<RecordType extends RaRecord = any>(
        resource: ResourceType,
        params: GetListParams
    ): Promise<GetListResult<RecordType>>

    abstract getOne<RecordType extends RaRecord = any>(
        resource: ResourceType,
        params: GetOneParams<RecordType>
    ): Promise<GetOneResult<RecordType>>

    abstract getMany<RecordType extends RaRecord = any>(
        resource: ResourceType,
        params: GetManyParams
    ): Promise<GetManyResult<RecordType>>

    abstract getManyReference<RecordType extends RaRecord = any>(
        resource: ResourceType,
        params: GetManyReferenceParams
    ): Promise<GetManyReferenceResult<RecordType>>

    abstract update<RecordType extends RaRecord = any>(
        resource: ResourceType,
        params: UpdateParams
    ): Promise<UpdateResult<RecordType>>

    abstract updateMany<RecordType extends RaRecord = any>(
        resource: ResourceType,
        params: UpdateManyParams
    ): Promise<UpdateManyResult<RecordType>>

    abstract create<
        RecordType extends Omit<RaRecord, 'id'> = any,
        ResultRecordType extends RaRecord = RecordType & { id: Identifier }
    >(
        resource: ResourceType,
        params: CreateParams
    ): Promise<CreateResult<ResultRecordType>>

    abstract delete<RecordType extends RaRecord = any>(
        resource: ResourceType,
        params: DeleteParams<RecordType>
    ): Promise<DeleteResult<RecordType>>

    abstract deleteMany<RecordType extends RaRecord = any>(
        resource: ResourceType,
        params: DeleteManyParams<RecordType>
    ): Promise<DeleteManyResult<RecordType>>

    abstract subscribe(topic: string, subscriptionCallback: any): Promise<any>

    abstract unsubscribe(topic: string, subscriptionCallback: any): Promise<any>

    abstract publish(topic: string, event: any): Promise<any>

    abstract lock(resource: ResourceType, { id, identity, meta }: any): Promise<any>

    abstract unlock(resource: ResourceType, { id, identity, meta }: any): Promise<any>

    abstract getLock(resource: ResourceType, { id, meta }: any): Promise<any>

    abstract getLocks(resource: ResourceType, { meta }: any): Promise<any>

    abstract getTree(resource: ResourceType, params?: GetTreeParams): Promise<GetTreeResult>

    abstract getRootNodes(resource: ResourceType, params: GetRootNodesParams): Promise<GetRootNodesResult>

    abstract getParentNode<RecordType extends TreeRecord = TreeRecord>(resource: ResourceType, params: GetParentNodeParams<RecordType>): Promise<GetParentNodeResult>

    abstract getChildNodes(resource: ResourceType, { parentId, meta }: GetChildNodesParams): Promise<GetChildNodesResult>

    abstract moveAsNthChildOf(
        resource: ResourceType,
        { source, destination, position, meta }: MoveAsNthChildOfParams
    ): Promise<MoveAsNthChildOfResult>

    abstract moveAsNthSiblingOf(
        resource: ResourceType,
        { source, destination, position, meta }: MoveAsNthSiblingOfOfParams
    ): Promise<MoveAsNthSiblingOfOfResult>

    abstract addRootNode(resource: ResourceType, { data, meta }: AddRootNodeParams): Promise<AddRootNodeResult>

    abstract addChildNode(resource: ResourceType, { parentId, data, meta }: AddChildNodeParams): Promise<AddChildNodeResult>

    abstract deleteBranch(
        resource: ResourceType,
        params: DeleteBranchParams
    ): Promise<DeleteBranchResult>
}

export interface GetListParams {
    pagination: PaginationPayload;
    sort: SortPayload;
    filter: any;
    meta?: any;
}
export interface GetListResult<RecordType extends RaRecord = any> {
    data: RecordType[];
    total?: number;
    pageInfo?: {
        hasNextPage?: boolean;
        hasPreviousPage?: boolean;
    };
}

export interface GetInfiniteListResult<RecordType extends RaRecord = any>
    extends GetListResult<RecordType> {
    pageParam?: number;
}
export interface GetOneParams<RecordType extends RaRecord = any> {
    id: RecordType['id'];
    meta?: any;
}
export interface GetOneResult<RecordType extends RaRecord = any> {
    data: RecordType;
}

export interface GetManyParams {
    ids: Identifier[];
    meta?: any;
}
export interface GetManyResult<RecordType extends RaRecord = any> {
    data: RecordType[];
}

export interface GetManyReferenceParams {
    target: string;
    id: Identifier;
    pagination: PaginationPayload;
    sort: SortPayload;
    filter: any;
    meta?: any;
}
export interface GetManyReferenceResult<RecordType extends RaRecord = any> {
    data: RecordType[];
    total?: number;
    pageInfo?: {
        hasNextPage?: boolean;
        hasPreviousPage?: boolean;
    };
}

export interface UpdateParams<RecordType extends RaRecord = any> {
    id: RecordType['id'];
    data: Partial<RecordType>;
    previousData: RecordType;
    meta?: any;
}
export interface UpdateResult<RecordType extends RaRecord = any> {
    data: RecordType;
}

export interface UpdateManyParams<T = any> {
    ids: Identifier[];
    data: Partial<T>;
    meta?: any;
}
export interface UpdateManyResult<RecordType extends RaRecord = any> {
    data?: RecordType['id'][];
}

export interface CreateParams<T = any> {
    data: Partial<T>;
    meta?: any;
}
export interface CreateResult<RecordType extends RaRecord = any> {
    data: RecordType;
}

export interface DeleteParams<RecordType extends RaRecord = any> {
    id: RecordType['id'];
    previousData?: RecordType;
    meta?: any;
}
export interface DeleteResult<RecordType extends RaRecord = any> {
    data: RecordType;
}

export interface DeleteManyParams<RecordType extends RaRecord = any> {
    ids: RecordType['id'][];
    meta?: any;
}
export interface DeleteManyResult<RecordType extends RaRecord = any> {
    data?: RecordType['id'][];
}

export type DataProviderResult<RecordType extends RaRecord = any> =
    | CreateResult<RecordType>
    | DeleteResult<RecordType>
    | DeleteManyResult
    | GetListResult<RecordType>
    | GetManyResult<RecordType>
    | GetManyReferenceResult<RecordType>
    | GetOneResult<RecordType>
    | UpdateResult<RecordType>
    | UpdateManyResult

export interface TreeRecord extends RaRecord {
    children: Identifier[];
}

export interface WithChildren<RecordType extends TreeRecord = TreeRecord> {
    children: TreeRecordWithChildren<RecordType>[];
}

export type TreeRecordWithChildren<RecordType extends TreeRecord = TreeRecord> =
    WithChildren<RecordType> & RecordType

export interface TreeSet {
    [key: string]: Identifier[];
    [key: number]: Identifier[];
}

export interface TreeRecordSet {
    [key: string]: TreeRecord;
    [key: number]: TreeRecord;
}

/* dataProvider types */
export interface TreeDataProvider<ResourceType extends string = string> {
    getTree: <RecordType extends TreeRecord = TreeRecord>(
        resource: ResourceType,
        params?: GetTreeParams
    ) => Promise<GetTreeResult<RecordType>>;
    getRootNodes: <RecordType extends TreeRecord = TreeRecord>(
        resource: ResourceType,
        params: GetRootNodesParams
    ) => Promise<GetRootNodesResult<RecordType>>;
    getParentNode: <RecordType extends TreeRecord = TreeRecord>(
        resource: ResourceType,
        params: GetParentNodeParams<RecordType>
    ) => Promise<GetParentNodeResult<RecordType>>;
    getChildNodes: <RecordType extends TreeRecord = TreeRecord>(
        resource: ResourceType,
        params: GetChildNodesParams<RecordType>
    ) => Promise<GetChildNodesResult<RecordType>>;
    moveAsNthChildOf: <RecordType extends TreeRecord = TreeRecord>(
        resource: ResourceType,
        params: MoveAsNthChildOfParams<RecordType>
    ) => Promise<MoveAsNthChildOfResult<RecordType>>;
    moveAsNthSiblingOf: <RecordType extends TreeRecord = TreeRecord>(
        resource: ResourceType,
        params: MoveAsNthSiblingOfOfParams<RecordType>
    ) => Promise<MoveAsNthSiblingOfOfResult<RecordType>>;
    addRootNode: <RecordType extends TreeRecord = TreeRecord>(
        resource: ResourceType,
        params: AddRootNodeParams<RecordType>
    ) => Promise<AddRootNodeResult<RecordType>>;
    addChildNode: <RecordType extends TreeRecord = TreeRecord>(
        resource: ResourceType,
        params: AddChildNodeParams<RecordType>
    ) => Promise<AddChildNodeResult<RecordType>>;
    deleteBranch: <RecordType extends TreeRecord = TreeRecord>(
        resource: ResourceType,
        params: DeleteBranchParams<RecordType>
    ) => Promise<DeleteBranchResult<RecordType>>;
}

export type GetTreeParams = {
    meta?: any;
}

export type GetTreeResult<RecordType extends TreeRecord = TreeRecord> = {
    data: RecordType[];
}

export type GetRootNodesParams = {
    meta?: any;
}

export type GetRootNodesResult<RecordType extends TreeRecord = TreeRecord> = {
    data: RecordType[];
}

export type GetParentNodeParams<RecordType extends TreeRecord = TreeRecord> = {
    childId: RecordType['id'];
    meta?: any;
}

export type GetParentNodeResult<RecordType extends TreeRecord = TreeRecord> = {
    data: RecordType;
}

export interface GetChildNodesParams<
    RecordType extends TreeRecord = TreeRecord
> {
    parentId: RecordType['id'];
    meta?: any;
}

export type GetChildNodesResult<RecordType extends TreeRecord = TreeRecord> = {
    data: RecordType[];
}

export type MoveAsNthChildOfParams<RecordType extends TreeRecord = TreeRecord> =
    {
        source: RecordType;
        destination: RecordType;
        position: number;
        meta?: any;
    }

export type MoveAsNthChildOfResult<RecordType extends TreeRecord = TreeRecord> =
    { data?: RecordType }

export type MoveAsNthSiblingOfOfParams<
    RecordType extends TreeRecord = TreeRecord
> = {
    source: RecordType;
    destination: RecordType;
    position: number;
    meta?: any;
}

export type MoveAsNthSiblingOfOfResult<
    RecordType extends TreeRecord = TreeRecord
> = { data?: RecordType }

export type AddRootNodeParams<RecordType extends TreeRecord = TreeRecord> = {
    data: Partial<RecordType>;
    meta?: any;
}

export type AddRootNodeResult<RecordType extends TreeRecord = TreeRecord> = {
    data: RecordType;
}

export type AddChildNodeParams<RecordType extends TreeRecord = TreeRecord> = {
    parentId: RecordType['id'];
    data: Partial<RecordType>;
    meta?: any;
}

export type AddChildNodeResult<RecordType extends TreeRecord = TreeRecord> = {
    data: RecordType;
}

export type DeleteBranchParams<RecordType extends TreeRecord = TreeRecord> =
    DeleteParams<RecordType>

export type DeleteBranchResult<RecordType extends TreeRecord = TreeRecord> =
    DeleteResult<RecordType>
