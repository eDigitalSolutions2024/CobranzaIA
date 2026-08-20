import mongoose from "mongoose"

const PaymentPromiseSchema =
new mongoose.Schema(

{

clientId:{

type:mongoose.Schema.Types.ObjectId,

ref:"Client",

required:true

},

messageId:{

type:mongoose.Schema.Types.ObjectId,

ref:"Message",

default:null

},

amount:{

type:Number,

default:0

},

promisedDate:{

type:Date,

required:true

},

status:{

type:String,

enum:[

"pending",

"completed",

"broken",

"cancelled"

],

default:"pending"

},

notes:{

type:String,

default:null

},

detectedByAI:{

type:Boolean,

default:true

}

},

{

timestamps:true

}

)

PaymentPromiseSchema.index({ clientId: 1 })
PaymentPromiseSchema.index({ status: 1, promisedDate: 1 })

export default mongoose.model(
"PaymentPromise",
PaymentPromiseSchema
)