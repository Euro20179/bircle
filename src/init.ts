import common from './common'
import {loadItems} from './shop'

let INITIALIZED = false

function init(done?: Function){
    common.loadMatchCommands()
    common.reloadBlackList()
    common.reloadWhiteList()
    common.reloadIDBlackLists()
    loadItems()
    INITIALIZED = true
    done?.()
}

export default {
    INITIALIZED,
    init
}
