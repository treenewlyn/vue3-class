import {
    ref,
    ComponentPublicInstance,
    ComponentOptions,
    VNode,
    SetupContext,
    VNodeProps,
    AllowedComponentProps,
    ComponentCustomProps,
    proxyRefs,
    Prop,
    PropType,
    ComponentObjectPropsOptions,
    EmitsOptions,
    ShallowUnwrapRef,
    Ref,
    getCurrentInstance
} from 'vue'


declare const withDefaultSymbol: unique symbol

export interface WithDefault<T> {
    [withDefaultSymbol]: T
}

export type DefaultFactory<T> = (
    props: Record<string, unknown>
) => T | null | undefined

export interface PropOptions<T = any, D = T> {
    type?: PropType<T> | true | null
    required?: boolean
    default?: D | DefaultFactory<D> | null | undefined | object
    validator?(value: unknown): boolean
}

export interface PropOptionsWithDefault<T, D = T> extends PropOptions<T, D> {
    default: PropOptions<T, D>['default']
}

export interface PropOptionsWithRequired<T, D = T> extends PropOptions<T, D> {
    required: true
}

export type VueWithProps<P> = Vue<ExtractProps<P>, {}, ExtractDefaultProps<P>> &
    ExtractProps<P>

export type ExtractProps<P> = {
    [K in keyof P]: P[K] extends WithDefault<infer T> ? T : P[K]
}

export type DefaultKeys<P> = {
    [K in keyof P]: P[K] extends WithDefault<any> ? K : never
}[keyof P]

export type ExtractDefaultProps<P> = {
    [K in DefaultKeys<P>]: P[K] extends WithDefault<infer T> ? T : never
}

// With default
export function prop<T>(options: PropOptionsWithDefault<T>): WithDefault<T>

// With required
export function prop<T>(options: PropOptionsWithRequired<T>): T

// Others
export function prop<T>(options: Prop<T>): T | undefined

// Actual implementation
export function prop(options: Prop<unknown>): unknown {
    return options
}

function defineGetter<T, K extends keyof T>(
    obj: T,
    key: K,
    getter: () => T[K]
): void {
    Object.defineProperty(obj, key, {
        get: getter,
        enumerable: false,
        configurable: true,
    })
}

function defineProxy(proxy: any, key: string, target: any): void {
    Object.defineProperty(proxy, key, {
        get: () => target[key].value,
        set: (value) => {
            target[key].value = value
        },
        enumerable: true,
        configurable: true,
    })
}

function getSuper(Ctor: typeof VueImpl): typeof VueImpl | undefined {
    const superProto = Object.getPrototypeOf(Ctor.prototype)
    if (!superProto) {
        return undefined
    }

    return superProto.constructor as typeof VueImpl
}

function getOwn<T extends Object, K extends keyof T>(
    value: T,
    key: K
): T[K] | undefined {
    return value.hasOwnProperty(key) ? value[key] : undefined
}

export interface VueStatic {
    // -- Class component configs

    /**
     * @internal
     * The cache of __vccOpts
     */
    __c?: ComponentOptions

    /**
     * @internal
     * The base options specified to this class.
     */
    __b?: ComponentOptions

    /**
     * @internal
     * Component options specified with `@Options` decorator
     */
    __o?: ComponentOptions

    /**
     * @internal
     * Decorators applied to this class.
     */
    __d?: ((options: ComponentOptions) => void)[]

    /**
     * @internal
     * Registered (lifecycle) hooks that will be ported from class methods
     * into component options.
     */
    __h: string[]

    /**
     * @internal
     * Final component options object that Vue core processes.
     * The name must be __vccOpts since it is the contract with the Vue core.
     */
    __vccOpts: ComponentOptions

    // --- Vue Loader etc injections

    /** @internal */
    render?: () => VNode | void

    /** @internal */
    ssrRender?: () => void

    /** @internal */
    __file?: string

    /** @internal */
    __cssModules?: Record<string, any>

    /** @internal */
    __scopeId?: string

    /** @internal */
    __hmrId?: string
}

export type PublicProps = VNodeProps &
    AllowedComponentProps &
    ComponentCustomProps

export type VueBase = Vue<unknown, never[]>

export type VueMixin<V extends VueBase = VueBase> = VueStatic & {
    prototype: V
}

export interface ClassComponentHooks {
    // To be extended on user land
    data?(): object
    beforeCreate?(): void
    created?(): void
    beforeMount?(): void
    mounted?(): void
    beforeUnmount?(): void
    unmounted?(): void
    beforeUpdate?(): void
    updated?(): void
    activated?(): void
    deactivated?(): void
    render?(): VNode | void
    errorCaptured?(err: Error, vm: Vue, info: string): boolean | undefined
    serverPrefetch?(): Promise<unknown>
}

export type Vue<
    Props = unknown,
    Emits extends EmitsOptions = {},
    DefaultProps = {}
    > = ComponentPublicInstance<
        Props,
        {},
        {},
        {},
        {},
        Emits,
        PublicProps,
        DefaultProps,
        true
    > &
    ClassComponentHooks

export interface VueConstructor<V extends VueBase = Vue> extends VueMixin<V> {
    new(...args: any[]): V

    // --- Public APIs

    registerHooks(keys: string[]): void

    with<P extends { new(): unknown }>(
        Props: P
    ): VueConstructor<V & VueWithProps<InstanceType<P>>>
}

class VueImpl {
    static __h = [
        'data',
        'beforeCreate',
        'created',
        'beforeMount',
        'mounted',
        'beforeUnmount',
        'unmounted',
        'beforeUpdate',
        'updated',
        'activated',
        'deactivated',
        'render',
        'errorCaptured',
        'serverPrefetch',
    ]

    static get __vccOpts(): ComponentOptions {
        // Early return if `this` is base class as it does not have any options
        if (this === Vue) {
            return {}
        }

        const Ctor = this as VueConstructor

        const cache = getOwn(Ctor, '__c')
        if (cache) {
            return cache
        }

        // If the options are provided via decorator use it as a base
        const options: ComponentOptions = { ...getOwn(Ctor, '__o') }
        Ctor.__c = options

        // Handle super class options
        const Super = getSuper(Ctor)
        if (Super) {
            options.extends = Super.__vccOpts
        }

        // Inject base options as a mixin
        const base = getOwn(Ctor, '__b')
        if (base) {
            options.mixins = options.mixins || []
            options.mixins.unshift(base)
        }

        options.methods = { ...options.methods }
        options.computed = { ...options.computed }

        const proto = Ctor.prototype
        Object.getOwnPropertyNames(proto).forEach((key) => {
            if (key === 'constructor') {
                return
            }

            // hooks
            if (Ctor.__h.indexOf(key) > -1) {
                ; (options as any)[key] = (proto as any)[key]
                return
            }

            const descriptor = Object.getOwnPropertyDescriptor(proto, key)!

            // methods
            if (typeof descriptor.value === 'function') {
                ; (options.methods as any)[key] = descriptor.value
                return
            }

            // computed properties
            if (descriptor.get || descriptor.set) {
                ; (options.computed as any)[key] = {
                    get: descriptor.get,
                    set: descriptor.set,
                }
                return
            }
        })

        options.setup = function (props: Record<string, any>, ctx: SetupContext) {
            const data: any = new Ctor(props, ctx)
            const dataKeys = Object.keys(data)

            const plainData: any = {}
            let promise: Promise<any> | null = null

            // Initialize reactive data and convert constructor `this` to a proxy
            dataKeys.forEach((key) => {
                // Skip if the value is undefined not to make it reactive.
                // If the value has `__s`, it's a value from `setup` helper, proceed it later.
                if (data[key] === undefined || (data[key] && data[key].__s)) {
                    return
                }

                plainData[key] = ref(data[key])
                defineProxy(data, key, plainData)
            })

            // Invoke composition functions
            dataKeys.forEach((key) => {
                if (data[key] && data[key].__s) {
                    const setupState = data[key].__s()
                    if (setupState instanceof Promise) {
                        if (!promise) {
                            promise = Promise.resolve(plainData)
                        }
                        promise = promise.then(() => {
                            return setupState.then((value) => {
                                plainData[key] = proxyRefs(value)
                                return plainData
                            })
                        })
                    } else {
                        plainData[key] = proxyRefs(setupState)
                    }
                }
            })

            return promise ?? plainData
        }

        const decorators = getOwn(Ctor, '__d')
        if (decorators) {
            decorators.forEach((fn) => fn(options))
        }

        // from Vue Loader
        const injections = [
            'render',
            'ssrRender',
            '__file',
            '__cssModules',
            '__scopeId',
            '__hmrId',
        ]
        injections.forEach((key) => {
            if ((Ctor as any)[key]) {
                options[key] = (Ctor as any)[key]
            }
        })

        return options
    }

    static registerHooks(keys: string[]): void {
        this.__h.push(...keys)
    }

    static with(Props: { new(): unknown }): VueConstructor {
        const propsMeta = new Props() as Record<string, Prop<any> | undefined>
        const props: ComponentObjectPropsOptions = {}

        Object.keys(propsMeta).forEach((key) => {
            const meta = propsMeta[key]
            props[key] = meta ?? null
        })

        class PropsMixin extends this {
            static __b: ComponentOptions = {
                props,
            }
        }
        return PropsMixin as VueConstructor
    }

    $props!: Record<string, any>
    $emit!: (event: string, ...args: any[]) => void
    $attrs!: ComponentPublicInstance['$attrs']
    $slots!: ComponentPublicInstance['$slots']

    constructor(props: Record<string, any>, ctx: SetupContext) {
        defineGetter(this, '$props', () => props)
        defineGetter(this, '$attrs', () => ctx.attrs)
        defineGetter(this, '$slots', () => ctx.slots)
        defineGetter(this, '$emit', () => ctx.emit)

        const cins = getCurrentInstance();
        if(cins) {
            const gps = cins.appContext.config.globalProperties;
            Object.keys(gps).forEach(name => {
                defineGetter(this, name as any, () => gps[name])
            });
        }

        Object.keys(props).forEach((key) => {
            Object.defineProperty(this, key, {
                enumerable: false,
                configurable: true,
                writable: true,
                value: (props as any)[key],
            })
        })
    }
}

export const Vue: VueConstructor = VueImpl as VueConstructor


export function Options<V extends Vue>(
    options: ComponentOptions & ThisType<V>
): <VC extends VueConstructor<VueBase>>(target: VC) => VC {
    return (Component) => {
        Component.__o = options
        return Component
    }
}

export interface VueDecorator {
    // Class decorator
    (Ctor: VueConstructor<VueBase>): void

    // Property decorator
    (target: VueBase, key: string): void

    // Parameter decorator
    (target: VueBase, key: string, index: number): void
}

export function createDecorator(
    factory: (options: ComponentOptions, key: string, index: number) => void
): VueDecorator {
    return (
        target: VueBase | VueConstructor<VueBase>,
        key?: any,
        index?: any
    ) => {
        const Ctor =
            typeof target === 'function'
                ? target
                : (target.constructor as VueConstructor)
        if (!Ctor.__d) {
            Ctor.__d = []
        }
        if (typeof index !== 'number') {
            index = undefined
        }
        Ctor.__d.push((options) => factory(options, key, index))
    }
}

export type UnionToIntersection<U> = (
    U extends any ? (k: U) => void : never
) extends (k: infer I) => void
    ? I
    : never

export type ExtractInstance<T> = T extends VueMixin<infer V> ? V : never

export type MixedVueBase<Mixins extends VueMixin[]> = Mixins extends (infer T)[]
    ? VueConstructor<UnionToIntersection<ExtractInstance<T>> & Vue>
    : never

export function mixins<T extends VueMixin[]>(...Ctors: T): MixedVueBase<T>
export function mixins(...Ctors: VueMixin[]): VueConstructor {
    return class MixedVue extends Vue {
        static __b: ComponentOptions = {
            mixins: Ctors.map((Ctor) => Ctor.__vccOpts),
        }

        constructor(...args: any[]) {
            super(...args)

            Ctors.forEach((Ctor) => {
                const data = new (Ctor as VueConstructor)(...args)
                Object.keys(data).forEach((key) => {
                    ; (this as any)[key] = (data as any)[key]
                })
            })
        }
    }
}

export type UnwrapSetupValue<T> = T extends Ref<infer R>
    ? R
    : ShallowUnwrapRef<T>

export type UnwrapPromise<T> = T extends Promise<infer R> ? R : T

export function setup<R>(setupFn: () => R): UnwrapSetupValue<UnwrapPromise<R>> {
    // Hack to delay the invocation of setup function.
    // Will be called after dealing with class properties.
    return {
        __s: setupFn,
    } as UnwrapSetupValue<UnwrapPromise<R>>
}