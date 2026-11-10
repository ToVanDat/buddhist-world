# Buddhist World – Implementation Status

Cập nhật: 2026-11-10. Tài liệu phân biệt phần đã được viết trong source với phần đã được kiểm chứng bằng CI hoặc runtime.

## Quy tắc triển khai

- Không thay đổi `main` trực tiếp; mọi thay đổi đi qua branch/PR.
- Không chạy migration trên database người dùng khi chưa có yêu cầu rõ ràng.
- Không deploy, merge, xóa dữ liệu hoặc rotate secret môi trường đang chạy nếu chưa có xác nhận.
- Không đánh dấu asset, multiplayer, performance hoặc production-ready nếu chưa có bằng chứng test tương ứng.

## Trạng thái theo phase

| Phase | Phạm vi | Trạng thái |
|---|---|---|
| 0 | Repository/source audit | Đã audit source; máy local và runtime chưa xác minh |
| 1 | Foundation, auth/session, validation, CI | Source hardening + PostgreSQL/Redis integration suite; run #202 xanh (typecheck, unit tests, integration tests, builds) |
| 2 | Blender asset pipeline | Có export riêng visual/collision GLB, Blender navmesh exporter và topology validator; chưa có hero .blend/.glb hoặc navmesh thật để nghiệm thu |
| 3 | Character rig/animation | Monk blockout generator tạo 6 NLA activity clips; GLB AnimationMixer map + `--npc` validator; chưa có GLB rigged chất lượng cuối để nghiệm thu |
| 4 | Cinematic temple region | Có blockout, đường đi và các mốc tương tác; chưa có hero environment assets |
| 5 | Controller, camera, interaction, mobile | Keyboard/touch, checkpoint, camera raycast chống xuyên vật thể và reset vận tốc sau correction đã có source; cần test thiết bị |
| 6 | Persistence | Có UI profile, API display name, checkpoint, autosave tọa độ/hướng nhìn; integration suite pass CI #202, local runtime vẫn cần xác minh |
| 7 | Multiplayer | Reconnect, single-active-socket, đồng bộ animation và multi-client integration test pass CI #202; chưa có load test/multi-instance adapter |
| 8 | Persistent world/streaming | Có manifest asset theo region, loader theo region active, chuyển region qua socket và autosave vị trí/yaw mỗi 15 giây; chưa có chunk streaming/shared object state |
| 9 | Social/community | Chưa triển khai đầy đủ |
| 10 | Desktop/mobile performance | Có quality profiles, auto step-down và DEV overlay đo FPS/frame time/draw calls/triangles/memory; chưa có benchmark thiết bị thật |
| 11 | Production deployment | Chưa thực hiện; cần secrets, TLS, backup, monitoring và load test |

## Đã bổ sung trong nhánh Phase 1 + gameplay slice

- Access JWT gắn session ID; REST auth kiểm tra session còn hiệu lực.
- Refresh rotation khóa row trong transaction; logout/refresh thu hồi session cũ.
- Socket kiểm tra session và đóng kết nối khi session bị thu hồi.
- Redis rate limit dùng Lua atomic; production fail-closed khi Redis lỗi.
- Express Request được mở rộng type-safe bằng global Express namespace.
- Region manifest có checkpoint đặt tên tại Tam Quan, sân chùa, chính điện và bờ hồ sen.
- Người chơi có thể đến gần checkpoint và nhấn E (desktop) hoặc nút HUD (touch) để lưu vị trí qua API đã xác thực.
- Khôi phục cả tọa độ lẫn hướng nhìn từ checkpoint hợp lệ; checkpoint sai region/id hoặc tọa độ không hữu hạn/vượt bounds sẽ bị bỏ qua.
- Sửa khoảng cách raycast ground detection cho capsule ở spawn height để trạng thái grounded/jump hoạt động đúng.
- Touch sprint chuyển thành thao tác giữ nút và reset khi pointer release/cancel/lost capture.
- Session watcher của Socket.IO tránh chạy chồng; PostgreSQL là nguồn xác thực chính và lỗi DB sẽ ngắt socket.
- Socket cũ không thể xóa presence hoặc ghi đè checkpoint của socket mới khi cùng tài khoản reconnect.
- Vị trí đã lưu được kiểm tra hữu hạn và nằm trong bounds trước khi dùng làm điểm spawn.
- Nearby player lookup dùng spatial hash theo cell thay vì quét toàn bộ cặp người chơi.
- Unit tests bao phủ checkpoint, movement bounds và spatial interest lookup.
- Tiến trình server đóng Socket.IO/HTTP trước, sau đó giải phóng PostgreSQL pool và Redis; shutdown được bảo vệ để không chạy lặp khi nhận nhiều signal.
- Dọn các interval realtime khi HTTP server đóng; timer được `unref()` để không giữ event loop.
- Socket.IO chỉ giữ một kết nối mới nhất cho mỗi user; socket cũ không được join, gửi movement/chat hoặc ghi đè presence/checkpoint.
- Region join xử lý lỗi PostgreSQL và Redis; Redis presence lỗi không làm mất acknowledgement join. Chat fail-closed nếu Redis rate limiter lỗi.
- Local/remote placeholder có locomotion state idle/walk/run/jump; remote animation lấy từ snapshot server.
- Có GLB renderer dùng `AnimationMixer` + `SkeletonUtils.clone` để mỗi người chơi có skeleton riêng; ánh xạ tên clip Blender/Mixamo và fallback clip khi thiếu state.
- Cấu hình `VITE_PLAYER_MODEL_URL` đọc từ `.env` gốc workspace; để trống thì dùng placeholder.
- Camera third-person raycast qua Rapier để thu ngắn camera khi có vật cản; khi server correction thì reset vận tốc client.
- Có UI profile trong HUD: tải hồ sơ, sửa tên hiển thị, lưu qua `PUT /api/me/profile`, cập nhật Zustand và hiển thị tên region/checkpoint đã dịch.
- Có migration `002_player_location_yaw.sql` để lưu hướng nhìn; checkpoint API ghi yaw cùng spawn.
- Realtime persistence ghi tọa độ, checkpoint và yaw mỗi 15 giây, khi disconnect và trước khi đổi region; các write theo user được tuần tự hóa.
- Checkpoint đã lưu được giữ nguyên khi autosave vị trí di chuyển trong cùng region.
- Region manifest hỗ trợ asset GLB có transform và collider; RegionContent chỉ mount asset của region đang active, giữ blockout trong lúc tích hợp asset cho temple_complex.
- GLB validator quét thư mục đệ quy, kiểm tra scene/node/mesh/material/UV/normal/texture/triangle count; chế độ character kiểm tra skeleton root và các clip Idle/Walk/Run/Jump với alias Blender/Mixamo.
- CI chạy GLB validator với `--allow-empty`; hiện thư mục asset chưa có GLB thật nên bước này chỉ xác nhận công cụ chạy đúng, không phải nghiệm thu model.
- DEV performance overlay đo FPS, frame time, draw calls, triangles, geometries và textures; đây là số liệu runtime tham khảo, chưa thay thế benchmark desktop/mobile có kiểm soát.
- Có hàm `switchRegion()` kiểm tra region ID, thay vùng đang active trên cùng Socket.IO connection.
- Integration suite bao phủ register/login, refresh rotation/reuse, logout/session revocation, profile/checkpoint, Redis revocation marker, reconnect, duplicate socket và remote animation; dùng schema PostgreSQL riêng và Redis DB 15.
- Integration suite đã chạy thành công trong GitHub Actions run #202 cùng typecheck, unit tests và production builds.

## CI evidence

- Source đợt trước đã được GitHub Actions run #112 kiểm tra thành công: install dependencies, typecheck, unit tests và production builds.
- GitHub Actions run #202: install, typecheck, unit tests, PostgreSQL/Redis integration tests và production builds đều success trên source head `1f5f4bd2cae03a8840f51f415ce577a6ecb3235d`.
- GitHub Actions run #222: install, typecheck, unit tests, PostgreSQL/Redis integration tests, GLB validator và production builds đều success trên source head `39016016232743ddf22d840c4aad02d37068448b`.
- Run #85 cũng xác minh camera raycast và sửa trường `timeOfImpact`; run #108 xác minh GLB clip mapping, profile schema/API và workspace env config.
- GitHub Actions run #64: install dependencies, typecheck, unit tests và production builds đều hoàn tất với kết quả success trên code head nêu trên.
- Source head được run #222 kiểm tra: `39016016232743ddf22d840c4aad02d37068448b`. Các commit tài liệu tiếp theo không thay đổi source code.
- CI hiện cài dependencies bằng `pnpm install --no-frozen-lockfile` vì repository chưa có `pnpm-lock.yaml`. Không tự tạo lockfile bằng cách đoán dependency resolution; cần sinh và commit lockfile bằng pnpm 9.15.0 trên môi trường Node/pnpm thực.
- CI xanh xác nhận build và unit tests trong runner GitHub; không thay thế kiểm thử PostgreSQL/Redis thật, multi-client hoặc thiết bị.

## Việc cần xác minh trước khi merge

1. Checkout head mới nhất và chạy typecheck, unit tests, production build trên máy local; CI run #112 đã xanh.
2. Chạy lại integration suite trên local bằng DB test riêng và Redis DB 15; CI run #202 đã xanh.
3. Xác minh thủ công checkpoint API, autosave và khôi phục vị trí/hướng nhìn trên local.
4. Xác minh thủ công multi-client, socket disconnect sau logout/refresh và reconnect cùng tài khoản.
5. Test spatial interest với nhiều client ở các cell/region khác nhau.
6. Chạy Blender batch export + GLB validation trên máy có Blender.
7. Kiểm tra CORS/cookie trên domain HTTPS thật.
8. Commit pnpm lockfile được sinh bởi pnpm 9.15.0 rồi chuyển CI sang `--frozen-lockfile`.
9. Xác nhận graceful shutdown trong môi trường chạy thật, gồm SIGINT/SIGTERM và kết nối DB/Redis đang hoạt động.

## Giới hạn đã biết

- Multiplayer authoritative state vẫn ở RAM của một server instance; Redis chưa phải Socket.IO adapter.
- Movement validation kiểm tra bounds và tốc độ nhưng chưa mô phỏng va chạm vật lý phía server.
- Region loader hiện đã hỗ trợ manifest GLB và mount theo region active, nhưng manifest temple_complex chưa có asset thật; chưa có chunk/LOD streaming hoặc shared object state persistence.
- Chưa có moderation, friends, events hoặc inventory hoàn chỉnh.
- Chưa có hero assets hoặc GLB nhân vật thật; AnimationMixer mới được kiểm chứng bằng typecheck/unit tests, chưa chạy với file GLB thật.
- Performance overlay mới là công cụ thu thập số liệu; chưa ghi nhận kết quả trên desktop/mobile mục tiêu hoặc đặt baseline FPS.
- Integration suite đã pass CI #202; chưa có local device/manual runtime verification hoặc tải nhiều người chơi thực tế.
- Chưa xác minh production deployment, backup/restore, observability hoặc khả năng chịu tải.


## Checkpoint integrity hardening

- `PUT /api/me/checkpoint` now requires a fresh online Redis presence heartbeat (maximum age 30 seconds), the same active region, and a server-side distance check within 4.5 metres of the requested manifest spawn (vertical tolerance 3.5 metres). A client cannot save a remote checkpoint by directly calling the endpoint.
- The client and server share the checkpoint radius constant. Unit tests cover in-range, out-of-range, wrong-region, vertical separation and invalid coordinates.
- This is source-code/CI verification only; no database migration or live database change is required.


## Navigation guidance

- The temple waypoint guide now displays distance plus a directional arrow relative to the player's current avatar heading. Bearing math is isolated in tested helpers and updates with the player's position/facing snapshot. Waypoint selection remains session-local; no new persistence schema is introduced.

## Quest reward integrity hardening

- Quest reward grants are now all-or-nothing within the same PostgreSQL transaction as quest progress/completion.
- A reward item must exist, its identifier and quantity must be valid, and the player's existing stack plus the full reward must fit the configured `stack_limit`.
- Inventory overflow no longer silently truncates rewards while completing the quest. If the full reward cannot fit, the transaction rolls back and the player can free inventory space before retrying the interaction.
- Reward item rows are locked in deterministic item-ID order before reading/updating inventory, reducing races between simultaneous reward grants.
- Added unit coverage for valid additions, exact stack limits, overflow, invalid quantities, invalid identifiers and invalid inventory state.
- No schema migration or live database mutation is required. This source change must still pass the branch CI before it is considered validated.


## NPC dialogue, quest journal and exploration achievements

- NPC dialogue lines are read from the active NPC's database record and presented as a keyboard-accessible multi-step conversation. Quest offers appear at the end; quest acceptance remains server-side and proximity-checked.
- Quest Journal now filters active/completed quests, shows aggregate objective progress and completion timestamps, and displays inventory stack capacity.
- Exploration achievements are derived only from server-recorded world events. A new additive migration creates achievement definitions and per-player unlock records; no achievement progress or unlock can be submitted by the client.
- The 005 migration is source-only until reviewed and applied to a backed-up staging database. It has not been applied to any live database.

## NPC behavior and animation extension — 2026-11-10

- NPC client actors now map authoritative schedule activities to distinct procedural fallback motion: walk gait, prayer pose/breathing, talk gestures, work motion and rest posture.
- NPC actor root position is aligned to the ground plane from the schedule's 1.2 m player-style reference height; movement and heading continue to interpolate from server snapshots.
- Added optional `VITE_NPC_MODEL_URL`. When configured, NPCs render a cloned GLB skeleton through the existing Three.js `AnimationMixer` controller rather than the procedural proxy.
- Animation clip aliases now cover Blender/Mixamo-style idle, walk, talk, pray, work and rest naming. Missing authored actions fall back to idle; this allows the generated idle-only blockout to remain usable without pretending that all final animation clips exist.
- GLB animation unit tests cover the new activity aliases and fallbacks.
- NPC proximity integration fixtures now obtain the current position from `GET /api/world/npcs`, the same authoritative schedule snapshot used by gameplay, rather than calculating a minute-only position independently of the server's second-level patrol clock.
- The exported patrol sampler now rejects malformed coordinates and zero-length route segments even when called directly outside database schedule validation.
- Navmesh and obstacle avoidance are deliberately not marked complete. The repository still has placeholder temple collision geometry and no accepted final walkable-surface mesh; baking navigation now would create routes tied to temporary geometry. Revisit after the final environment GLB/collision pass.
- No migration, production database change, merge, deployment or modification to `main` was performed for this extension.

## Final environment collision, navmesh and NPC activity clip pipeline — 2026-11-10

- Blender export now separates visible `EXPORT_<asset>` collections from simplified `COLLISION_<region>` collections. Collision GLBs are static, omit animation/skin export and can be mounted as invisible Rapier trimesh assets through `render: false`.
- Region asset metadata now supports `render: false` independently of `collision`, so decorative visual GLBs can disable trimesh generation while a separate low-poly collision GLB provides physics.
- Added `export_navmesh.py`: reads an explicitly authored `NAVMESH_<region>` collection, evaluates modifiers/world transforms, converts Z-up Blender coordinates to Y-up game metres, filters steep faces, triangulates, builds shared-edge adjacency and reports connected components/non-manifold edges.
- Added `validate-navmesh.mjs` for schema, finite coordinate, upward winding, degenerate triangle, neighbor reciprocity and non-manifold validation. A valid and invalid fixture plus a self-test verify acceptance/rejection behavior.
- Added CI steps for navmesh validator tests, committed navmesh asset validation, optional NPC GLB clip validation and Python syntax compilation of Blender scripts.
- Monk generator now authors six separate NLA clips (idle, walk, talk, pray, work, rest) on the existing rigid-part blockout armature. Visual GLB export includes NLA strips; collision export excludes animation and skin data.
- GLB validator has an opt-in `--npc` mode requiring a skinned root skeleton and all six activity clips.
- No final temple Blender project, final collision GLB, final NPC GLB or baked navmesh is present in the repository. CI's empty-folder allowance is a tooling check only, not an asset pass.
- No runtime navmesh A* integration has been enabled. Existing NPC waypoint schedules remain the active movement fallback until a real final navmesh is exported, reviewed and loaded by the authoritative server.
- No live database migration, production deployment, PR merge or change to `main` was performed.


### Procedural temple environment base

- Added `generate_temple_complex.py`, a non-destructive Blender generator that only accepts the untouched startup scene and writes a separate `.blend` file.
- The generator creates the Tam Quan gate, raised main hall, timber frame, curved roof planes, courtyard, approach walkway, lotus pond and lanterns with separate render/collision/navmesh collections.
- Render meshes receive placeholder UV layers and PBR base materials for export validation. These UVs are technical placeholders, not final artist unwraps or baked texture sets.
- Collision meshes are simplified and invisible at runtime; the ramp and central hall aisle are aligned with the exported walkable surfaces.
- The guide NPC's migration waypoint route has been aligned with the generated gate/courtyard/ramp/central-aisle route. Migration 006 remains unapplied.
- The generator has not been run with Blender in this environment. Its Python syntax is checked in CI; actual .blend generation, Blender mesh validation, GLB export, navmesh bake and R3F visual/collision QA still require the user's Blender runtime.


## Reusable procedural vegetation — 2026-11-10

- Added `generate_vegetation_library.py`: 15 reusable source mesh variants across pine, broadleaf, bodhi, bamboo and shrub silhouettes.
- The generator scatters linked instances using a fixed seed and zone-specific species weights across outer mountain, Tam Quan, lotus garden, main temple, stupa garden and mountain retreat.
- Source mesh objects are kept in a non-export asset-library collection; runtime visual instances are isolated in `EXPORT_vegetation_temple_complex`.
- Vegetation is visual-only in this pass. It does not modify terrain collision/navmesh, does not add tree-trunk colliders and is not yet registered in the runtime manifest.
- The source and documentation are committed to `feature/phase1-foundation-hardening`. Blender execution, scene inspection, GLB export/size validation and in-browser performance testing remain pending; no generated `.blend` or `.glb` is claimed as accepted output.



## Ground vegetation + Geometry Nodes + LOD — 2026-11-10

- Added \`blender/scripts/generate_ground_vegetation.py\`: deterministic terrain sampling for grass, fern, wildflower and moss source meshes; excludes the central pilgrimage axis, major building/pavilion footprints and lotus pond.
- Geometry Nodes performs source-object instancing with per-point yaw and scale variation; instances are realized for GLB export. Source assets are kept outside the \`EXPORT_\` collections.
- Generates three separate export collections/GLBs: \`ground_vegetation_lod0.glb\`, \`ground_vegetation_lod1.glb\`, \`ground_vegetation_lod2.glb\`. LOD1 uses approximately 55% source mesh complexity and 42% point density; LOD2 uses approximately 22% source mesh complexity and 14% point density.
- All LOD levels use prefixes of the same deterministic point set to reduce spatial popping. They are visual-only and do not modify collision or navmesh.
- CI Python syntax validation now includes both vegetation generator scripts.
- **Not yet runtime-verified:** Blender has not yet been run against the generated scene in the user's environment; Geometry Nodes evaluation, GLB export, GLB validation, visual quality and browser rendering remain pending.
- The region manifest remains unchanged until the three generated GLBs exist and pass inspection/validation. Browser-side distance LOD switching, frustum culling, GPU instancing and device profiling remain the next integration step.

## Runtime vegetation LOD foundation — 2026-11-10

- Added `VegetationLodAsset.tsx`: uses Three.js `LOD` to switch between three GLB representations by camera distance, with per-level hysteresis and an empty far level for distance culling.
- Extended `RegionAssetDef` with optional three-level LOD metadata and a cull distance. `RegionContent` routes visual-only assets with LOD metadata through the new renderer; collision assets continue through the existing static collision path.
- Region-scoped loading is preserved: vegetation variants are mounted only while the owning region is active. Three.js mesh frustum culling remains enabled for the loaded GLB meshes.
- The manifest is intentionally not populated with vegetation URLs until Blender exports exist and pass GLB validation. The LOD renderer currently loads all three variants for an active LOD asset; this trades memory for straightforward distance switching and should be profiled before large-scale use.
- GPU instancing is **not yet claimed**: the current Blender ground-cover pass realizes Geometry Nodes instances for GLB export. The runtime LOD integration is separate from a future InstancedMesh/EXT_mesh_gpu_instancing path.
- Typecheck, browser runtime, draw-call reduction, memory, and visual transition QA are pending the next CI run and real generated assets.

## GPU-instanced vegetation runtime path — 2026-11-10

- Added `InstancedVegetationAsset.tsx`: traverses a static source GLB and creates one Three.js `InstancedMesh` per source mesh/material, applying per-instance position, Euler rotation and scale.
- Instance batches enable cast/receive shadows and frustum culling; placement transforms are typed in the shared region manifest.
- `RegionContent` selects the LOD renderer when three LOD variants are configured, otherwise selects the GPU-instanced renderer when instance transforms are supplied. Both paths are visual-only (`collision: false`) and only mount in the active region.
- No instance placement data or asset URL is registered yet because the source GLBs/placement data have not been generated and validated. Do not treat this renderer as measured performance improvement until browser profiling confirms draw calls, memory and frame time.


## Hero Bodhi tree and lotus ecosystem foundation — 2026-11-10

- Added `generate_hero_vegetation.py`: a separate, deterministic procedural pass for a Bodhi hero-tree base and a richer lotus ecosystem.
- Bodhi base includes a flared trunk, buttress roots, branch curves, layered foliage masses and shared leaf-card geometry.
- Lotus pass replaces the earlier simple lotus proxies in the generated scene with cupped/notched pads, stems, layered curved petals, flower centers and marginal reeds.
- Outputs are isolated into `EXPORT_hero_bodhi_tree` and `EXPORT_lotus_ecosystem`; both are visual-only and do not change collision or navmesh.
- This is a procedural foundation, not final AAA hero art. Sculpted bark, bespoke leaf/flower silhouettes, authored textures, water shader/animation and in-game visual review remain outstanding.
- No generated `.blend` or `.glb` is claimed as present; Blender must be run locally before validation, export and runtime manifest registration.


## Vietnamese temple architecture detailing — 2026-11-10

- Added `blender/scripts/generate_architecture_details.py`, an additive pass for the existing cinematic temple scene.
- Adds procedural timber bracket / con-son-inspired support groups under the main hall and Tam Quan eaves, main-hall door lattice/panels/signboard, stair nosings and ramp balustrades.
- Adds a tiered memorial stupa blockout on the generated hillside with an octagonal plinth, bell dome, spire tiers and garden markers.
- Output is isolated in `EXPORT_architecture_details`; it is visual-only and does not change collision or navmesh. Existing bell/drum towers, ancestor hall and mountain retreat are reused rather than duplicated.
- The new pass is a procedural detailing foundation, not final AAA or historically verified architecture. Hand-authored joinery, carved reliefs, roof ornaments, detailed textures, proportion review and in-Blender visual QA remain outstanding.
- CI now syntax-compiles the architecture generator. No Blender scene, GLB or runtime asset has been generated or accepted in this source-only update.
