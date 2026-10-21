import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-me";
let mongoReady = false;
let users = [];
let transactions = [];
let investments = [];
let budgets = {};

const userSchema = new mongoose.Schema({ name: {type:String,required:true}, email: {type:String,required:true,unique:true,lowercase:true}, passwordHash:{type:String,required:true} },{timestamps:true});
const transactionSchema = new mongoose.Schema({ userId:{type:String,required:true,index:true}, title:{type:String,required:true}, type:{type:String,enum:["income","expense"],required:true}, category:{type:String,required:true}, amount:{type:Number,required:true,min:.01}, date:{type:String,required:true} },{timestamps:true});
const investmentSchema = new mongoose.Schema({ userId:{type:String,required:true,index:true}, name:{type:String,required:true}, type:{type:String,required:true}, investedAmount:{type:Number,required:true,min:.01}, currentValue:{type:Number,required:true,min:0}, date:{type:String,required:true} },{timestamps:true});
const budgetSchema = new mongoose.Schema({ userId:{type:String,unique:true,required:true}, monthlyBudget:{type:Number,required:true,min:1} },{timestamps:true});
const User = mongoose.models.User || mongoose.model("User",userSchema);
const Transaction = mongoose.models.Transaction || mongoose.model("Transaction",transactionSchema);
const Investment = mongoose.models.Investment || mongoose.model("Investment",investmentSchema);
const Budget = mongoose.models.Budget || mongoose.model("Budget",budgetSchema);

const idOf = x => String(x._id ?? x.id);
const pubTx = t => ({id:idOf(t),title:t.title,type:t.type,category:t.category,amount:t.amount,date:t.date});
const pubInv = i => ({id:idOf(i),name:i.name,type:i.type,investedAmount:i.investedAmount,currentValue:i.currentValue,date:i.date});
const pubUser = u => ({id:idOf(u),name:u.name,email:u.email});
function tokenFor(u){return jwt.sign({sub:idOf(u),email:u.email},JWT_SECRET,{expiresIn:"12h"});}
function auth(req,res,next){
 const header=req.headers.authorization||"";
 const token=header.startsWith("Bearer ")?header.slice(7):"";
 if(!token)return res.status(401).json({message:"Please log in."});
 try{req.user=jwt.verify(token,JWT_SECRET);next();}catch{return res.status(401).json({message:"Session expired. Please log in again."});}
}
async function userExists(id){if(mongoReady)return User.findById(id);return users.find(u=>u.id===id);}
app.get("/api/health",(_q,s)=>s.json({ok:true,database:mongoReady?"MongoDB":"in-memory demo"}));

app.post("/api/auth/signup",async(req,res,next)=>{
 try{
  const name=String(req.body.name||"").trim(),email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
  if(name.length<2)return res.status(400).json({message:"Enter your name (at least 2 characters)."});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({message:"Enter a valid email address."});
  if(password.length<8)return res.status(400).json({message:"Password must contain at least 8 characters."});
  const exists=mongoReady?await User.findOne({email}):users.find(u=>u.email===email);
  if(exists)return res.status(409).json({message:"An account with this email already exists."});
  const passwordHash=await bcrypt.hash(password,12);
  const user=mongoReady?await User.create({name,email,passwordHash}):{id:crypto.randomUUID(),name,email,passwordHash};
  if(!mongoReady)users.push(user);
  const uid=idOf(user);
  if(mongoReady)await Budget.create({userId:uid,monthlyBudget:20000});
  else budgets[uid]=20000;
  res.status(201).json({token:tokenFor(user),user:pubUser(user)});
 }catch(e){if(e.code===11000)return res.status(409).json({message:"An account with this email already exists."});next(e);}
});
app.post("/api/auth/login",async(req,res,next)=>{
 try{
  const email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
  const user=mongoReady?await User.findOne({email}):users.find(u=>u.email===email);
  if(!user||!(await bcrypt.compare(password,user.passwordHash)))return res.status(401).json({message:"Email or password is incorrect."});
  res.json({token:tokenFor(user),user:pubUser(user)});
 }catch(e){next(e);}
});
app.get("/api/auth/me",auth,async(req,res,next)=>{try{const u=await userExists(req.user.sub);if(!u)return res.status(401).json({message:"Account not found."});res.json({user:pubUser(u)});}catch(e){next(e);}});

app.get("/api/transactions",auth,async(req,res,next)=>{try{const rows=mongoReady?await Transaction.find({userId:req.user.sub}).sort({date:-1}):transactions.filter(t=>t.userId===req.user.sub).sort((a,b)=>b.date.localeCompare(a.date));res.json(rows.map(pubTx));}catch(e){next(e);}});
app.post("/api/transactions",auth,async(req,res,next)=>{try{
 const {title,type,category,amount,date}=req.body;
 if(!String(title||"").trim()||!["income","expense"].includes(type)||!String(category||"").trim()||!Number.isFinite(Number(amount))||Number(amount)<=0||!date)return res.status(400).json({message:"Enter a title, valid type, category, positive amount and date."});
 const data={userId:req.user.sub,title:title.trim(),type,category:category.trim(),amount:Number(amount),date};
 if(mongoReady)return res.status(201).json(pubTx(await Transaction.create(data)));
 const row={id:crypto.randomUUID(),...data};transactions.push(row);res.status(201).json(pubTx(row));
}catch(e){next(e);}});
app.delete("/api/transactions/:id",auth,async(req,res,next)=>{try{
 if(mongoReady)await Transaction.findOneAndDelete({_id:req.params.id,userId:req.user.sub});
 else transactions=transactions.filter(t=>!(t.id===req.params.id&&t.userId===req.user.sub));
 res.json({message:"Transaction deleted"});
}catch(e){next(e);}});

app.get("/api/budget",auth,async(req,res,next)=>{try{
 if(mongoReady){let b=await Budget.findOne({userId:req.user.sub});if(!b)b=await Budget.create({userId:req.user.sub,monthlyBudget:20000});return res.json({monthlyBudget:b.monthlyBudget});}
 res.json({monthlyBudget:budgets[req.user.sub]||20000});
}catch(e){next(e);}});
app.put("/api/budget",auth,async(req,res,next)=>{try{
 const amount=Number(req.body.monthlyBudget);if(!Number.isFinite(amount)||amount<1)return res.status(400).json({message:"Budget must be a positive number."});
 if(mongoReady){const b=await Budget.findOneAndUpdate({userId:req.user.sub},{userId:req.user.sub,monthlyBudget:amount},{upsert:true,new:true,runValidators:true});return res.json({monthlyBudget:b.monthlyBudget});}
 budgets[req.user.sub]=amount;res.json({monthlyBudget:amount});
}catch(e){next(e);}});

app.get("/api/investments",auth,async(req,res,next)=>{try{const rows=mongoReady?await Investment.find({userId:req.user.sub}).sort({date:-1}):investments.filter(i=>i.userId===req.user.sub).sort((a,b)=>b.date.localeCompare(a.date));res.json(rows.map(pubInv));}catch(e){next(e);}});
app.post("/api/investments",auth,async(req,res,next)=>{try{
 const {name,type,investedAmount,currentValue,date}=req.body;
 if(!String(name||"").trim()||!String(type||"").trim()||!Number.isFinite(Number(investedAmount))||Number(investedAmount)<=0||!Number.isFinite(Number(currentValue))||Number(currentValue)<0||!date)return res.status(400).json({message:"Enter a name, type, positive invested amount, current value and date."});
 const data={userId:req.user.sub,name:name.trim(),type:type.trim(),investedAmount:Number(investedAmount),currentValue:Number(currentValue),date};
 if(mongoReady)return res.status(201).json(pubInv(await Investment.create(data)));
 const row={id:crypto.randomUUID(),...data};investments.push(row);res.status(201).json(pubInv(row));
}catch(e){next(e);}});
app.delete("/api/investments/:id",auth,async(req,res,next)=>{try{
 if(mongoReady)await Investment.findOneAndDelete({_id:req.params.id,userId:req.user.sub});
 else investments=investments.filter(i=>!(i.id===req.params.id&&i.userId===req.user.sub));
 res.json({message:"Investment deleted"});
}catch(e){next(e);}});

app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({message:"Server error. Check backend terminal."});});
if(process.env.MONGODB_URI){mongoose.connect(process.env.MONGODB_URI).then(()=>{mongoReady=true;console.log("MongoDB connected");}).catch(e=>console.warn("MongoDB unavailable; in-memory demo mode:",e.message));}
app.listen(PORT,()=>console.log(`FinTech Hub API: http://localhost:${PORT}`));
