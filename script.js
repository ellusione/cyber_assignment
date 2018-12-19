'use strict'
const events = require('events')

const START_TIME = Date.now()
const DEFAULT_NUM_ORDERS = 10
const MAX_TOPPINGS_COUNT = 14

const FREESTAGE = 'free_stage'
const FREEORDER = 'free_order'

const StageTypes = {
   DOUGHCHEF: 1,
   TOPPINGCHEF: 2,
   OVEN: 3,
   WAITER: 4,
   DONE: 5
}

function getRandomToppingsCount() {
    return Math.floor(Math.random() * Math.floor(MAX_TOPPINGS_COUNT));
}

class PrepConfig {
    constructor(stageType, secondsToPrep) {
        this.stageType = stageType
        this.msToPrep = secondsToPrep * 1000
    }
}


const doughChefConfig = new PrepConfig(StageTypes.DOUGHCHEF, 7)
const toppingChefConfig = new PrepConfig(StageTypes.TOPPINGCHEF, 4)
const ovenConfig = new PrepConfig(StageTypes.OVEN, 10)
const waiterConfig = new PrepConfig(StageTypes.WAITER, 5)

const allPreps = {}
const orders = {}
let ordersSize = 0

function onScriptStart () {
    function initPreps (cl, count) {
        const preps = []
        for (let i = 1; i <= count; i++) {
            preps.push(new cl(i))
        }
        return preps
    }
    
    allPreps[StageTypes.DOUGHCHEF] = initPreps(DoughChef, 2)
    allPreps[StageTypes.TOPPINGCHEF] = initPreps(ToppingChef, 3)
    allPreps[StageTypes.OVEN] = initPreps(Oven, 1)
    allPreps[StageTypes.WAITER] = initPreps(Waiter, 2)

    orders[StageTypes.DOUGHCHEF] = {}
    orders[StageTypes.TOPPINGCHEF] = {}
    orders[StageTypes.OVEN] = {}
    orders[StageTypes.WAITER] = {}
    orders[StageTypes.DONE] = {}
}

class Processor {
    
    constructor(id) {
        this.id = id
    }

    preProcess() {
        throw new Error('Implementation required')
    }

    postProcess() {
        throw new Error('Implementation required')
    }

    isReady() {
        throw new Error('Implementation required')
    }

    getStage() {
        throw new Error('Implementation required')
    }

    toString() {
        return `${this.constructor.name}:${this.id} stage ${this.getStage()}`
    }
}
class PrepStage extends Processor {
    constructor (id) {
        super(id)
        this.startTime = null
        this.eventEmitter = new events.EventEmitter()
        this.eventEmitter.addListener(FREESTAGE, freeStageListener);
    }

    static getConfig () {
        throw new Error('Implementation required')
    }

    preProcess() {
        this.startTime = Date.now()
    }

    postProcess() {
        this.startTime = null
        this.eventEmitter.emit(FREESTAGE, {prepStage: this})
    }

    isReady() {
        return !this.startTime
    }

    getStage() {
        return this.constructor.getConfig().stageType
    }

    toString() {
        return super.toString() + `, startTime ${this.startTime}`
    }

    calculateProcessingTime () {
        return this.constructor.getConfig().msToPrep
    }

    static getNextStage(stageType) {
        switch (stageType) {
            case null: 
                return StageTypes.DOUGHCHEF
            case StageTypes.DOUGHCHEF:
                return StageTypes.TOPPINGCHEF
            case StageTypes.TOPPINGCHEF:
                return StageTypes.OVEN
            case StageTypes.OVEN:
                return StageTypes.WAITER
            case StageTypes.WAITER:
                return StageTypes.DONE
            default: 
                throw new Error('invalid stage')
        }
    }
}

class DoughChef extends PrepStage {

    static getConfig () {
        return doughChefConfig
    }
}

class ToppingChef extends PrepStage {

    static getConfig () {
        return toppingChefConfig
    }

    calculateProcessingTime (order) {
        return Math.ceil(ToppingChef.getConfig().msToPrep * order.toppingsCount/2)
    }
}

class Oven extends PrepStage {

    static getConfig () {
        return ovenConfig
    }
}

class Waiter extends PrepStage {

    static getConfig () {
        return waiterConfig
    }
}

class Order extends Processor {
    constructor(id, toppingsCount) {
        super(id)
        this.toppingsCount = toppingsCount
        this.stage = StageTypes.DOUGHCHEF
        this.ready = true
        this.startTime = Date.now()
        this.eventEmitter = new events.EventEmitter()
        this.eventEmitter.addListener(FREEORDER, freeOrderListener)
    }

    isReady() {
        return this.ready
    }

    getStage() {
        return this.stage
    }

    preProcess() {
        this.ready = false
    }

    postProcess() {
        const priorStage = this.stage
        this.stage = PrepStage.getNextStage(priorStage) 

        this.logIfDoneProcessing()
        moveOrder(this, priorStage)
        this.ready = true

        this.eventEmitter.emit(FREEORDER, {order: this})
    }

    toString() {
        return super.toString() + `, toppingsCount ${this.toppingsCount}`
    }

    logIfDoneProcessing() {
        if (this.stage === StageTypes.DONE) {
            const now = Date.now()
            console.log(`Done processing ${this} with time spent processing: ${now-this.startTime}`)
        }
    }
}

async function attemptToProcess (order, prepStage) {
    const canProcess = order.isReady() && prepStage.isReady() && order.getStage() === prepStage.getStage()
    if (!canProcess) return false

    prepStage.preProcess()
    order.preProcess()

    const time = prepStage.calculateProcessingTime(order)

    console.log(`Processing order ${order} at prep stage ${prepStage} with time to process ${time}`)
    
    await setTimeout(async () => {
        order.postProcess()
        prepStage.postProcess()

        return true
    }, time)
}

function moveOrder(order, priorStage) {
    delete orders[priorStage][order.id]
    orders[order.getStage()][order.id] = order

    logIfDoneProcessingAll()
}

function logIfDoneProcessingAll() {
    if (Object.keys(orders[StageTypes.DONE]).length === ordersSize) {
        const now = Date.now()
        console.log(
            `Done processing orders at time ${now}. Time spent processing ${ordersSize} orders: ${now-START_TIME}`
        )
    }
}

function initOrders(countOrders) {
    for (let i = 1; i <= countOrders; i++) {
        const order = new Order(i, getRandomToppingsCount())
        orders[order.getStage()][order.id] = order
        ordersSize++
    }
}

async function initOrderProcessing() {
    const ordersAtInitStage = orders[StageTypes.DOUGHCHEF]
    for (let i in ordersAtInitStage) {
        const order = ordersAtInitStage[i]
        await freeOrderListener({order})
    }
}

async function freeStageListener ({prepStage}) {
    const ordersAtStage = orders[prepStage.getStage()]
    if (ordersAtStage.length === 0) return 

    for (let i in ordersAtStage) {
        const order = ordersAtStage[i]
        if (await attemptToProcess(order, prepStage)) {
            return 
        }
    }
}

async function freeOrderListener ({order}) {
    if (order.stage === StageTypes.DONE) {
        return
    }

    const prepsAtStage = allPreps[order.getStage()]

    for (let i in prepsAtStage) {
        const prepStage = prepsAtStage[i]
        if (await attemptToProcess(order, prepStage)) {
            return 
        }
    }
}

onScriptStart()

const orderCount = process.argv.slice(2)[0] || DEFAULT_NUM_ORDERS
initOrders(orderCount)
initOrderProcessing()
