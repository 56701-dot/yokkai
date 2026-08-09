# FitQuest Pose Biomechanics AI

ระบบจำแนกท่าออกกำลังกายและประเมินฟอร์มจากลำดับ MediaPipe BlazePose 33 landmarks
โดยไม่ใช้ภาพ RGB เป็น input ของโมเดล

## Architecture

```text
Trainer videos
  -> BlazePose world landmarks [T, 33, x/y/z/visibility]
  -> quality control + rep segmentation
  -> body-frame normalization
  -> positions + velocities + joint angles + angular velocities
  -> LSTM / Transformer / ST-GCN
  -> exercise logits + form logits
  -> confidence gate + temporal smoothing
  -> real-time result or abstain
```

โมเดลมีสอง classification heads:

- `exercise`: squat, pushup, jumping_jack, plank หรือคลาสที่กำหนดใน config
- `form`: incorrect / correct

`error_tags` เช่น `knee_valgus`, `shallow_depth`, `hip_sag` ถูกเก็บใน dataset
เพื่อรองรับการเพิ่ม multi-label error head ภายหลัง โดยไม่ต้อง annotate ใหม่ทั้งหมด

## 1. Dataset Structure

```text
data/
  manifest.csv
  videos/
    squat/trainer_001/session_001.mp4
  landmarks/
    squat_trainer_001_session_001_rep_0001.npz
  annotations/
    squat_trainer_001_session_001.json
```

หนึ่งแถวใน manifest คือหนึ่ง repetition หรือหนึ่งช่วง hold ที่ตัดแล้ว:

| Field | Meaning |
|---|---|
| `sample_id` | ID ที่ไม่ซ้ำ |
| `landmarks_path` | NPZ ที่มี `landmarks [T,33,4]` และ `timestamps [T]` |
| `source_video_path` | คลิปต้นทางสำหรับ audit |
| `trainer_id` | ใช้ group split ป้องกัน identity leakage |
| `exercise_label` | ชนิดท่า |
| `form_label` | `correct`, `incorrect` หรือเว้นว่างถ้ายังไม่ review |
| `error_tags` | ข้อผิดพลาดคั่นด้วย `|` |
| `split` | train / val / test |
| `start_sec`, `end_sec` | ช่วงในคลิปต้นทาง |
| `fps` | FPS ต้นทาง |

ใช้ [manifest.example.csv](data/manifest.example.csv) เป็นแม่แบบ

### Annotation protocol

1. ใช้ trainer ที่มี credential ตรวจสอบได้ และเก็บ consent/license ของคลิป
2. ให้ผู้เชี่ยวชาญอย่างน้อยสองคน label แบบไม่เห็นคำตอบกัน
3. นิยาม correct form ต่อ exercise ล่วงหน้าเป็นเกณฑ์ที่วัดได้ เช่น knee flexion,
   trunk inclination, joint alignment และ range of motion
4. สร้าง incorrect samples ภายใต้การควบคุม ไม่ควรถือว่า “คลิปที่ไม่ใช่ trainer”
   คือฟอร์มผิดโดยอัตโนมัติ
5. เก็บหลายมุมกล้อง รูปร่าง เพศ อายุ ระดับทักษะ ความเร็ว และอุปกรณ์
6. รายงาน inter-rater agreement ด้วย Cohen's kappa และส่งเคสไม่ตรงกันให้ adjudicator
7. แบ่ง train/val/test ตาม `trainer_id` และ `source_video_path` เสมอ

Test set ควรมี external cohort จากสถานที่ กล้อง และบุคคลที่ไม่อยู่ในชุดพัฒนา

## 2. Landmark Extraction

ติดตั้ง:

```powershell
cd biomechanics_ai
python -m pip install -e ".[serve,dev]"
```

ดึง landmark จากคลิป:

```powershell
pose-biomech extract data/videos/squat/clip.mp4 data/landmarks/clip.npz
```

Pipeline เลือก `pose_world_landmarks` ก่อน image-coordinate landmarks, เก็บ visibility
และ timestamp ทุกเฟรม และทำเครื่องหมาย detection ที่หายด้วย visibility เท่ากับศูนย์
เพื่อให้โมเดลแยก “ข้อต่อมองไม่เห็น” ออกจากการเคลื่อนไหวจริง

## 3. Biomechanics Features

[features.py](pose_biomech/features.py) ทำสิ่งต่อไปนี้:

- เลื่อน origin ไปกึ่งกลางสะโพก
- scale ด้วย torso length/hip width
- หมุนเข้าสู่ body-centric coordinate frame
- คำนวณ normalized 3D joint positions
- คำนวณ linear velocity ด้วย timestamp จริง
- คำนวณมุม elbow, shoulder, hip, knee, ankle และ trunk
- คำนวณ angular velocity
- ส่ง visibility mask เข้าโมเดล

การ normalize นี้ลด nuisance จากตำแหน่งในภาพ ระยะกล้อง และความสูงผู้ใช้
แต่ยังคง joint geometry และ movement dynamics ซึ่งเป็นสัญญาณทาง biomechanics

## 4. Model Selection

| Model | จุดแข็ง | ข้อจำกัด | ใช้เมื่อ |
|---|---|---|---|
| LSTM | เร็ว ขนาดเล็ก baseline ดี | จับความสัมพันธ์ระยะไกล/หลายข้อต่อได้จำกัด | dataset เล็กหรือ edge CPU |
| Transformer | เรียน phase และ long-range timing ดี | ต้องการข้อมูล/regularization มากกว่า | default สำหรับ engineered biomechanics sequence |
| ST-GCN | inductive bias ตรงกับ skeleton graph | implementation/deployment ซับซ้อนกว่า | dataset ใหญ่และความสัมพันธ์ข้อต่อสำคัญ |

แนะนำให้เริ่ม Transformer ตาม config ปัจจุบัน พร้อม LSTM เป็น latency baseline แล้วเลือกจาก
grouped external test ไม่ใช่จาก train accuracy หากมีข้อมูลหลายหมื่น repetition ให้ทดสอบ
ST-GCN เป็นตัวหลัก เพราะ topology ของ skeleton ถูกใส่เข้าโมเดลโดยตรง

## 5. Training

แก้ class list และ path ใน [base.yaml](configs/base.yaml) แล้วรัน:

```powershell
pose-biomech train --config configs/base.yaml
pose-biomech evaluate runs/baseline/best.pt --split test
```

Training ใช้ class-balanced multi-task cross entropy, label smoothing, AdamW, cosine schedule,
gradient clipping, early stopping และบันทึก `best.pt` จากค่าเฉลี่ย macro-F1 ของ
exercise กับ form ไม่เลือก checkpoint จาก loss เพียงอย่างเดียว

เปลี่ยน `model.type` เป็น `lstm`, `transformer` หรือ `stgcn` เพื่อทำ ablation
โดย dataset และ evaluation เหมือนกัน

## 6. Evaluation

รายงาน:

- macro-F1, per-class precision/recall/F1 และ balanced accuracy
- confusion matrix
- one-vs-rest AUROC เมื่อ test split มีทุกคลาส
- Expected Calibration Error (ECE)
- form metrics แยกต่อ exercise
- coverage/abstention rate ใน production monitoring

สำหรับการนับ rep ให้ประเมิน event-level precision/recall และ MAE ของจำนวน rep เพิ่มเติม
เมื่อมี annotation ของ rep boundary ระบบนี้ประเมินเฉพาะ clip/window classification
เพื่อไม่ปะปนความแม่นของ segmentation กับ form classifier

## 7. Real-Time Inference

เปิด inference service หลังมี checkpoint:

```powershell
pose-biomech serve runs/baseline/best.pt --host 127.0.0.1 --port 8000
```

Health check อยู่ที่ `GET /health` และ inference อยู่ที่ `POST /v1/predict-window`
ตัวอย่าง bridge สำหรับ landmark stream ในเบราว์เซอร์อยู่ที่
[pose-ai-client.js](web/pose-ai-client.js)

ระบบสะสม 96 เฟรม, infer ทุก 4 เฟรม, smooth probability ด้วย EMA และ abstain เมื่อ:

- landmark ที่มองเห็นไม่ถึงสัดส่วนขั้นต่ำ
- exercise confidence ต่ำกว่า threshold
- form confidence ต่ำกว่า threshold

ควรแสดง feedback หลังผลคงที่หลาย window และไม่ใช้ผลนี้แทนการประเมินจากบุคลากร
ทางการแพทย์ โดยเฉพาะผู้ใช้ที่มีอาการเจ็บหรือข้อจำกัดการเคลื่อนไหว
