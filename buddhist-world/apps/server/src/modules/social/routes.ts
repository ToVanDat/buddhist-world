import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { getRegion } from "@bw/shared";
import { pool } from "../../db/pool.js";
import { requireAuth } from "../auth/requireAuth.js";
import { hit } from "../../lib/rateLimit.js";

export const socialRouter = Router();
socialRouter.use(requireAuth);
const uuid = z.string().uuid();
const orderedPair = (a: string, b: string): [string, string] => a < b ? [a, b] : [b, a];

async function hasBlock(client: import("pg").PoolClient, a: string, b: string) {
  const result = await client.query(
    "SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1",
    [a, b],
  );
  return result.rows.length > 0;
}
async function requireModerator(req: Request, res: Response, next: NextFunction) {
  try {
    const role = await pool.query<{ role: string }>("SELECT role FROM users WHERE id=$1", [req.auth!.sub]);
    if (!["moderator", "admin"].includes(role.rows[0]?.role ?? "")) {
      res.status(403).json({ error: "Bạn không có quyền kiểm duyệt cộng đồng." });
      return;
    }
    next();
  } catch (error) { next(error); }
}

socialRouter.get("/friends", async (req, res) => {
  const userId = req.auth!.sub;
  const [friends, sent, received, blocks] = await Promise.all([
    pool.query("SELECT u.id,u.username,p.display_name,f.created_at FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_low_id=$1 THEN f.user_high_id ELSE f.user_low_id END LEFT JOIN player_profiles p ON p.user_id=u.id WHERE f.user_low_id=$1 OR f.user_high_id=$1 ORDER BY u.username", [userId]),
    pool.query("SELECT fr.id,fr.recipient_id,fr.created_at,u.username,p.display_name FROM friend_requests fr JOIN users u ON u.id=fr.recipient_id LEFT JOIN player_profiles p ON p.user_id=u.id WHERE fr.requester_id=$1 AND fr.status='pending' ORDER BY fr.created_at DESC", [userId]),
    pool.query("SELECT fr.id,fr.requester_id,fr.created_at,u.username,p.display_name FROM friend_requests fr JOIN users u ON u.id=fr.requester_id LEFT JOIN player_profiles p ON p.user_id=u.id WHERE fr.recipient_id=$1 AND fr.status='pending' ORDER BY fr.created_at DESC", [userId]),
    pool.query("SELECT blocked_id FROM user_blocks WHERE blocker_id=$1 ORDER BY created_at DESC", [userId]),
  ]);
  res.json({ friends: friends.rows, sentRequests: sent.rows, receivedRequests: received.rows, blocks: blocks.rows });
});

socialRouter.get("/players", async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (query.length < 2 || query.length > 32) { res.status(400).json({ error: "Từ khóa tìm người chơi cần từ 2 đến 32 ký tự." }); return; }
  if (!(await hit("social-player-search:" + req.auth!.sub, 20, 60))) { res.status(429).json({ error: "Bạn tìm kiếm quá nhanh." }); return; }
  const escaped = query.replace(/[\\%_]/g, (character) => "\\" + character);
  const result = await pool.query("SELECT u.id,u.username,p.display_name FROM users u LEFT JOIN player_profiles p ON p.user_id=u.id WHERE u.id<>$1 AND (u.username ILIKE $2 OR p.display_name ILIKE $2) AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1)) ORDER BY u.username LIMIT 20", [req.auth!.sub, "%" + escaped + "%"]);
  res.json({ players: result.rows });
});

socialRouter.post("/friends/requests/:targetUserId", async (req, res) => {
  const target = typeof req.params.targetUserId === "string" ? req.params.targetUserId : "";
  const user = req.auth!.sub;
  if (!uuid.safeParse(target).success || target === user) { res.status(400).json({ error: "Người nhận không hợp lệ." }); return; }
  const [low, high] = orderedPair(user, target);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`friend-pair:${low}:${high}`]);
    const exists = await client.query("SELECT id FROM users WHERE id=$1", [target]);
    if (!exists.rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Không tìm thấy người chơi." }); return; }
    if (await hasBlock(client, user, target)) { await client.query("ROLLBACK"); res.status(403).json({ error: "Không thể gửi lời mời tới người chơi này." }); return; }
    const friendship = await client.query("SELECT 1 FROM friendships WHERE user_low_id=$1 AND user_high_id=$2", [low, high]);
    if (friendship.rows.length) { await client.query("ROLLBACK"); res.status(409).json({ error: "Hai người đã là bạn." }); return; }
    const reverse = await client.query<{ id: string }>(
      "SELECT id FROM friend_requests WHERE requester_id=$1 AND recipient_id=$2 AND status='pending' FOR UPDATE", [target, user]);
    if (reverse.rows[0]) {
      await client.query("INSERT INTO friendships(user_low_id,user_high_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [low, high]);
      await client.query("UPDATE friend_requests SET status='accepted',updated_at=now() WHERE id=$1", [reverse.rows[0].id]);
      await client.query("COMMIT"); res.json({ status: "accepted" }); return;
    }
    const inserted = await client.query(
      `INSERT INTO friend_requests(requester_id,recipient_id) VALUES($1,$2)
       ON CONFLICT(requester_id,recipient_id) DO UPDATE SET status='pending',updated_at=now()
       WHERE friend_requests.status <> 'pending' RETURNING id`, [user, target]);
    if (!inserted.rows[0]) { await client.query("ROLLBACK"); res.status(409).json({ error: "Lời mời đang chờ phản hồi." }); return; }
    await client.query("COMMIT"); res.status(201).json({ id: inserted.rows[0].id, status: "pending" });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});

socialRouter.post("/friends/requests/:requestId/respond", async (req, res) => {
  const id = typeof req.params.requestId === "string" ? req.params.requestId : "";
  const body = z.object({ decision: z.enum(["accept","decline"]) }).safeParse(req.body);
  if (!uuid.safeParse(id).success || !body.success) { res.status(400).json({ error: "Phản hồi lời mời không hợp lệ." }); return; }
  const user = req.auth!.sub;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const preview = await client.query<{ requester_id: string }>(
      "SELECT requester_id FROM friend_requests WHERE id=$1 AND recipient_id=$2 AND status='pending'", [id,user]);
    if (!preview.rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Lời mời không tồn tại hoặc đã xử lý." }); return; }
    const requester = preview.rows[0].requester_id;
    const [low,high] = orderedPair(user,requester);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`friend-pair:${low}:${high}`]);
    const locked = await client.query(
      "SELECT id FROM friend_requests WHERE id=$1 AND recipient_id=$2 AND status='pending' FOR UPDATE", [id,user]);
    if (!locked.rows[0]) { await client.query("ROLLBACK"); res.status(409).json({ error: "Lời mời vừa được xử lý." }); return; }
    if (await hasBlock(client,user,requester)) { await client.query("ROLLBACK"); res.status(403).json({ error: "Người gửi đang bị chặn." }); return; }
    if (body.data.decision === "accept") {
      await client.query("INSERT INTO friendships(user_low_id,user_high_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [low,high]);
    }
    const status = body.data.decision === "accept" ? "accepted" : "declined";
    await client.query("UPDATE friend_requests SET status=$2,updated_at=now() WHERE id=$1", [id,status]);
    await client.query("COMMIT"); res.json({ status });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});

socialRouter.post("/blocks/:targetUserId", async (req,res) => {
  const target = typeof req.params.targetUserId === "string" ? req.params.targetUserId : "";
  const user = req.auth!.sub;
  if (!uuid.safeParse(target).success || target===user) { res.status(400).json({error:"Người chơi không hợp lệ."}); return; }
  const [low,high]=orderedPair(user,target); const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`friend-pair:${low}:${high}`]);
    const exists=await client.query("SELECT 1 FROM users WHERE id=$1",[target]);
    if(!exists.rows.length){await client.query("ROLLBACK");res.status(404).json({error:"Không tìm thấy người chơi."});return;}
    await client.query("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[user,target]);
    await client.query("DELETE FROM friendships WHERE user_low_id=$1 AND user_high_id=$2",[low,high]);
    await client.query(`UPDATE friend_requests SET status='cancelled',updated_at=now()
      WHERE status='pending' AND ((requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1))`,[user,target]);
    await client.query("COMMIT");res.status(204).end();
  } catch(error){await client.query("ROLLBACK");throw error;} finally{client.release();}
});
socialRouter.delete("/blocks/:targetUserId", async (req,res) => {
  const target=typeof req.params.targetUserId==="string"?req.params.targetUserId:"";
  if(!uuid.safeParse(target).success){res.status(400).json({error:"Người chơi không hợp lệ."});return;}
  await pool.query("DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2",[req.auth!.sub,target]);res.status(204).end();
});

socialRouter.get("/party", async (req,res) => {
  const result=await pool.query(
    `SELECT p.id,p.region_id,p.leader_user_id,p.status,pm.role
       FROM party_members pm JOIN parties p ON p.id=pm.party_id
      WHERE pm.user_id=$1 AND pm.left_at IS NULL AND p.status='active'`,[req.auth!.sub]);
  const party=result.rows[0]; if(!party){res.json({party:null});return;}
  const members=await pool.query(
    `SELECT u.id,u.username,pp.display_name,pm.role,pm.joined_at FROM party_members pm
       JOIN users u ON u.id=pm.user_id LEFT JOIN player_profiles pp ON pp.user_id=u.id
      WHERE pm.party_id=$1 AND pm.left_at IS NULL ORDER BY pm.joined_at,u.id`,[party.id]);
  res.json({party:{...party,members:members.rows}});
});
socialRouter.post("/party", async (req,res) => {
  const body=z.object({regionId:z.string().regex(/^[a-z0-9_-]{1,64}$/i)}).safeParse(req.body);
  if(!body.success||!getRegion(body.data.regionId)){res.status(400).json({error:"Khu vực party không hợp lệ."});return;}
  const user=req.auth!.sub;const client=await pool.connect();
  try{
    await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`party-user:${user}`]);
    const active=await client.query("SELECT 1 FROM party_members WHERE user_id=$1 AND left_at IS NULL",[user]);
    if(active.rows.length){await client.query("ROLLBACK");res.status(409).json({error:"Bạn đã ở trong một party."});return;}
    const party=await client.query("INSERT INTO parties(leader_user_id,region_id) VALUES($1,$2) RETURNING id",[user,body.data.regionId]);
    await client.query("INSERT INTO party_members(party_id,user_id,role) VALUES($1,$2,'leader')",[party.rows[0].id,user]);
    await client.query("COMMIT");res.status(201).json({partyId:party.rows[0].id,regionId:body.data.regionId});
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});
socialRouter.post("/party/:partyId/join", async (req,res) => {
  const partyId=typeof req.params.partyId==="string"?req.params.partyId:"";const user=req.auth!.sub;
  if(!uuid.safeParse(partyId).success){res.status(400).json({error:"Party không hợp lệ."});return;}
  const client=await pool.connect();
  try{
    await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`party-user:${user}`]);
    const party=await client.query("SELECT id FROM parties WHERE id=$1 AND status='active' FOR UPDATE",[partyId]);
    if(!party.rows.length){await client.query("ROLLBACK");res.status(404).json({error:"Party không tồn tại hoặc đã đóng."});return;}
    const active=await client.query("SELECT 1 FROM party_members WHERE user_id=$1 AND left_at IS NULL",[user]);
    if(active.rows.length){await client.query("ROLLBACK");res.status(409).json({error:"Bạn đã ở trong một party."});return;}
    const blocked=await client.query(`SELECT 1 FROM party_members pm JOIN user_blocks b
      ON (b.blocker_id=pm.user_id AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=pm.user_id)
      WHERE pm.party_id=$1 AND pm.left_at IS NULL LIMIT 1`,[partyId,user]);
    if(blocked.rows.length){await client.query("ROLLBACK");res.status(403).json({error:"Party có thành viên thuộc danh sách chặn."});return;}
    const count=await client.query("SELECT count(*)::int AS count FROM party_members WHERE party_id=$1 AND left_at IS NULL",[partyId]);
    if(count.rows[0].count>=8){await client.query("ROLLBACK");res.status(409).json({error:"Party đã đủ 8 thành viên."});return;}
    await client.query(`INSERT INTO party_members(party_id,user_id) VALUES($1,$2)
      ON CONFLICT(party_id,user_id) DO UPDATE SET role='member',joined_at=now(),left_at=NULL`,[partyId,user]);
    await client.query("COMMIT");res.status(204).end();
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});
socialRouter.post("/party/leave", async (req,res) => {
  const user=req.auth!.sub;const client=await pool.connect();
  try{
    await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`party-user:${user}`]);
    const member=await client.query<{party_id:string;role:string}>("SELECT party_id,role FROM party_members WHERE user_id=$1 AND left_at IS NULL FOR UPDATE",[user]);
    if(!member.rows[0]){await client.query("ROLLBACK");res.status(404).json({error:"Bạn hiện không ở trong party."});return;}
    const partyId=member.rows[0].party_id;await client.query("SELECT id FROM parties WHERE id=$1 FOR UPDATE",[partyId]);
    await client.query("UPDATE party_members SET left_at=now() WHERE party_id=$1 AND user_id=$2",[partyId,user]);
    if(member.rows[0].role==="leader"){
      const next=await client.query<{user_id:string}>("SELECT user_id FROM party_members WHERE party_id=$1 AND left_at IS NULL ORDER BY joined_at,user_id LIMIT 1 FOR UPDATE",[partyId]);
      if(next.rows[0]){
        await client.query("UPDATE party_members SET role='leader' WHERE party_id=$1 AND user_id=$2",[partyId,next.rows[0].user_id]);
        await client.query("UPDATE parties SET leader_user_id=$2,updated_at=now() WHERE id=$1",[partyId,next.rows[0].user_id]);
      }else await client.query("UPDATE parties SET status='closed',closed_at=now(),updated_at=now() WHERE id=$1",[partyId]);
    }
    await client.query("COMMIT");res.status(204).end();
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});
socialRouter.get("/party/:partyId/messages", async (req,res) => {
  const partyId=typeof req.params.partyId==="string"?req.params.partyId:"";
  if(!uuid.safeParse(partyId).success){res.status(400).json({error:"Party không hợp lệ."});return;}
  const member=await pool.query("SELECT 1 FROM party_members WHERE party_id=$1 AND user_id=$2 AND left_at IS NULL",[partyId,req.auth!.sub]);
  if(!member.rows.length){res.status(403).json({error:"Bạn không phải thành viên party."});return;}
  const messages=await pool.query(`SELECT m.id,m.sender_id,u.username,p.display_name,m.body,m.created_at
    FROM party_messages m JOIN users u ON u.id=m.sender_id LEFT JOIN player_profiles p ON p.user_id=u.id
    WHERE m.party_id=$1 ORDER BY m.id DESC LIMIT 50`,[partyId]);
  res.json({messages:messages.rows.reverse()});
});
socialRouter.post("/party/:partyId/messages", async (req,res) => {
  const partyId=typeof req.params.partyId==="string"?req.params.partyId:"";const body=z.object({text:z.string().trim().min(1).max(1200)}).safeParse(req.body);
  if(!uuid.safeParse(partyId).success||!body.success){res.status(400).json({error:"Tin nhắn party không hợp lệ."});return;}
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const member=await client.query("SELECT 1 FROM party_members WHERE party_id=$1 AND user_id=$2 AND left_at IS NULL FOR UPDATE",[partyId,req.auth!.sub]);
    if(!member.rows.length){await client.query("ROLLBACK");res.status(403).json({error:"Bạn không phải thành viên party."});return;}
    const result=await client.query("INSERT INTO party_messages(party_id,sender_id,body) VALUES($1,$2,$3) RETURNING id,created_at",[partyId,req.auth!.sub,body.data.text]);
    await client.query("COMMIT");res.status(201).json({id:result.rows[0].id,createdAt:result.rows[0].created_at});
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});

socialRouter.post("/events",requireModerator,async (req,res) => {
  const body=z.object({
    title:z.string().trim().min(1).max(160),description:z.string().trim().max(2000).default(""),
    regionId:z.string().regex(/^[a-z0-9_-]{1,64}$/i),startsAt:z.string().datetime(),endsAt:z.string().datetime(),
    capacity:z.number().int().min(2).max(500).default(32),
  }).strict().safeParse(req.body);
  if(!body.success||!getRegion(body.data.regionId)||
     new Date(body.data.startsAt)<=new Date()||new Date(body.data.endsAt)<=new Date(body.data.startsAt)){
    res.status(400).json({error:"Thông tin sự kiện không hợp lệ."});return;
  }
  const result=await pool.query(
    `INSERT INTO community_events(host_user_id,title,description,region_id,starts_at,ends_at,capacity,status)
     VALUES($1,$2,$3,$4,$5,$6,$7,'published') RETURNING id,title,starts_at,ends_at,status`,
    [req.auth!.sub,body.data.title,body.data.description,body.data.regionId,body.data.startsAt,body.data.endsAt,body.data.capacity]);
  res.status(201).json(result.rows[0]);
});

socialRouter.get("/events", async (req,res) => {
  const result=await pool.query(`SELECT e.id,e.title,e.description,e.region_id,e.starts_at,e.ends_at,e.capacity,e.host_user_id,
    u.username AS host_username,count(m.user_id)::int AS participant_count,
    COALESCE(bool_or(m.user_id=$1),false) AS joined
    FROM community_events e JOIN users u ON u.id=e.host_user_id LEFT JOIN community_event_members m ON m.event_id=e.id
    WHERE e.status='published' AND e.ends_at>now() GROUP BY e.id,u.username ORDER BY e.starts_at,e.id LIMIT 100`,[req.auth!.sub]);
  res.json({events:result.rows});
});
socialRouter.post("/events/:eventId/join", async (req,res) => {
  const id=typeof req.params.eventId==="string"?req.params.eventId:"";
  if(!uuid.safeParse(id).success){res.status(400).json({error:"Sự kiện không hợp lệ."});return;}
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const event=await client.query<{capacity:number}>("SELECT capacity FROM community_events WHERE id=$1 AND status='published' AND ends_at>now() FOR UPDATE",[id]);
    if(!event.rows[0]){await client.query("ROLLBACK");res.status(404).json({error:"Sự kiện không tồn tại hoặc đã kết thúc."});return;}
    const exists=await client.query("SELECT 1 FROM community_event_members WHERE event_id=$1 AND user_id=$2",[id,req.auth!.sub]);
    if(exists.rows.length){await client.query("ROLLBACK");res.status(409).json({error:"Bạn đã tham gia sự kiện."});return;}
    const count=await client.query("SELECT count(*)::int AS count FROM community_event_members WHERE event_id=$1",[id]);
    if(count.rows[0].count>=event.rows[0].capacity){await client.query("ROLLBACK");res.status(409).json({error:"Sự kiện đã đủ người."});return;}
    await client.query("INSERT INTO community_event_members(event_id,user_id) VALUES($1,$2)",[id,req.auth!.sub]);
    await client.query("COMMIT");res.status(201).json({eventId:id,joined:true});
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});

socialRouter.post("/reports", async (req,res) => {
  if(!(await hit(`social-report:${req.auth!.sub}`,5,3600))){res.status(429).json({error:"Bạn đã gửi quá nhiều báo cáo trong thời gian ngắn."});return;}
  const body=z.object({
    targetType:z.enum(["user","party","event","message"]),targetId:z.string().trim().min(1).max(128),
    targetUserId:uuid.optional(),reason:z.string().trim().min(1).max(200),details:z.string().trim().max(2000).default(""),
  }).strict().safeParse(req.body);
  if(!body.success){res.status(400).json({error:"Báo cáo không hợp lệ."});return;}
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    // Resolve the reported owner from the target row itself. Never trust a client-supplied
    // targetUserId for party/event/message reports, and reject missing or self targets.
    let targetUserId: string | null = null;
    if(body.data.targetType==="user"){
      if(!uuid.safeParse(body.data.targetId).success){await client.query("ROLLBACK");res.status(400).json({error:"Người chơi được báo cáo không hợp lệ."});return;}
      const target=await client.query<{id:string}>("SELECT id FROM users WHERE id=$1",[body.data.targetId]);
      targetUserId=target.rows[0]?.id??null;
    }else if(body.data.targetType==="party"){
      if(!uuid.safeParse(body.data.targetId).success){await client.query("ROLLBACK");res.status(400).json({error:"Party được báo cáo không hợp lệ."});return;}
      const target=await client.query<{leader_user_id:string}>("SELECT leader_user_id FROM parties WHERE id=$1",[body.data.targetId]);
      targetUserId=target.rows[0]?.leader_user_id??null;
    }else if(body.data.targetType==="event"){
      if(!uuid.safeParse(body.data.targetId).success){await client.query("ROLLBACK");res.status(400).json({error:"Sự kiện được báo cáo không hợp lệ."});return;}
      const target=await client.query<{host_user_id:string}>("SELECT host_user_id FROM community_events WHERE id=$1",[body.data.targetId]);
      targetUserId=target.rows[0]?.host_user_id??null;
    }else{
      if(!/^[1-9][0-9]{0,17}$/.test(body.data.targetId)){await client.query("ROLLBACK");res.status(400).json({error:"Tin nhắn được báo cáo không hợp lệ."});return;}
      const target=await client.query<{sender_id:string}>("SELECT sender_id FROM party_messages WHERE id=$1",[body.data.targetId]);
      targetUserId=target.rows[0]?.sender_id??null;
    }
    if(!targetUserId){await client.query("ROLLBACK");res.status(404).json({error:"Không tìm thấy nội dung được báo cáo."});return;}
    if(targetUserId===req.auth!.sub){await client.query("ROLLBACK");res.status(400).json({error:"Không thể tự báo cáo nội dung của chính mình."});return;}
    const report=await client.query(`INSERT INTO moderation_reports(reporter_id,target_type,target_id,target_user_id,reason,details)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status,created_at`,
      [req.auth!.sub,body.data.targetType,body.data.targetId,targetUserId,body.data.reason,body.data.details]);
    await client.query("INSERT INTO moderation_report_events(report_id,actor_user_id,action) VALUES($1,$2,'created')",[report.rows[0].id,req.auth!.sub]);
    await client.query("COMMIT");res.status(201).json(report.rows[0]);
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});
socialRouter.get("/moderation/reports",requireModerator,async (req,res) => {
  const status=typeof req.query.status==="string"?req.query.status:"open";
  if(!["open","reviewing","resolved","dismissed","all"].includes(status)){res.status(400).json({error:"Trạng thái báo cáo không hợp lệ."});return;}
  const result=await pool.query(`SELECT r.id,r.target_type,r.target_id,r.target_user_id,r.reason,r.details,r.status,r.assigned_to,r.resolution,
    r.created_at,r.updated_at,u.username AS reporter_username FROM moderation_reports r JOIN users u ON u.id=r.reporter_id
    WHERE ($1='all' OR r.status=$1) ORDER BY r.created_at DESC LIMIT 100`,[status]);
  res.json({reports:result.rows});
});
socialRouter.patch("/moderation/reports/:reportId",requireModerator,async (req,res) => {
  const id=typeof req.params.reportId==="string"?req.params.reportId:"";
  const body=z.object({status:z.enum(["reviewing","resolved","dismissed"]),resolution:z.string().trim().max(2000).default("")}).strict().safeParse(req.body);
  if(!uuid.safeParse(id).success||!body.success){res.status(400).json({error:"Cập nhật báo cáo không hợp lệ."});return;}
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const updated=await client.query(`UPDATE moderation_reports SET status=$2,assigned_to=COALESCE(assigned_to,$3),resolution=$4,updated_at=now()
      WHERE id=$1 AND status IN ('open','reviewing') RETURNING id`,[id,body.data.status,req.auth!.sub,body.data.resolution]);
    if(!updated.rows.length){await client.query("ROLLBACK");res.status(404).json({error:"Báo cáo không tồn tại hoặc đã xử lý."});return;}
    await client.query("INSERT INTO moderation_report_events(report_id,actor_user_id,action,note) VALUES($1,$2,$3,$4)",[id,req.auth!.sub,body.data.status,body.data.resolution]);
    await client.query("COMMIT");res.json({id,status:body.data.status});
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});
