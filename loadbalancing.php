<?php
require_once __DIR__ . '/../db-config.php';
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];
switch ($method) {
    case 'GET':
        if (isset($_GET['id'])) {
            $stmt = $pdo->prepare('SELECT * FROM load_balancing_records WHERE id = ?');
            $stmt->execute([$_GET['id']]);
            $row = $stmt->fetch() ?: [];
            // decode JSON loads column for client convenience
            if (!empty($row) && isset($row['loads']) && $row['loads'] !== null) {
                $decoded = json_decode($row['loads'], true);
                $row['loads'] = $decoded !== null ? $decoded : $row['loads'];
            }
            echo json_encode($row);
        } else {
            $stmt = $pdo->query('SELECT * FROM load_balancing_records ORDER BY savedAt DESC, id DESC');
            $all = $stmt->fetchAll();
            // decode loads JSON for each row
            foreach ($all as &$r) {
                if (isset($r['loads']) && $r['loads'] !== null) {
                    $decoded = json_decode($r['loads'], true);
                    $r['loads'] = $decoded !== null ? $decoded : $r['loads'];
                }
            }
            unset($r);
            echo json_encode($all);
        }
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        // normalize date value so database accepts it
        if (isset($data['date']) && $data['date'] !== '') {
            $ts = strtotime(str_replace('/', '-', $data['date']));
            if ($ts !== false) {
                $data['date'] = date('Y-m-d', $ts);
            }
        }
        // normalize time value to 24‑hour format
        if (isset($data['time']) && $data['time'] !== '') {
            // attempt to parse using strtotime which understands AM/PM
            $ts2 = strtotime($data['time']);
            if ($ts2 !== false) {
                $data['time'] = date('H:i:s', $ts2);
            }
        }
        $stmt = $pdo->prepare(
            'INSERT INTO load_balancing_records
            (branch,company,location,panel,mcb,mainV,wires,conductedBy,witnessBy,certifiedBy,
             witnessTenant,circType,date,time,refId,remarks,vll,vln,vph,nameplate,meas_ia,meas_ib,
             meas_ic,meas_van,meas_vbn,meas_vcn,pf_a,pf_b,pf_c,phaseA,phaseB,phaseC,totalLoad,loads,fileName,savedAt,
             kvaTotal,vl1l2Ind,vl1l3Ind,vl2l3Ind,vl1nInd,vl2nInd,vl3nInd)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        );
        // cast numeric values to appropriate PHP types so MySQL DECIMAL columns
        // receive numbers instead of arbitrary strings
        $stmt->execute([
            $data['branch'] ?? null,
            $data['company'] ?? null,
            $data['location'] ?? null,
            $data['panel'] ?? null,
            isset($data['mcb']) ? (int)$data['mcb'] : null,
            isset($data['mainV']) ? (float)$data['mainV'] : null,
            $data['wires'] ?? null,
            $data['conductedBy'] ?? null,
            $data['witnessBy'] ?? null,
            $data['certifiedBy'] ?? null,
            $data['witnessTenant'] ?? null,
            $data['circType'] ?? null,
            $data['date'] ?? null,
            $data['time'] ?? null,
            $data['refId'] ?? null,
            $data['remarks'] ?? null,
            isset($data['vll']) ? (float)$data['vll'] : null,
            isset($data['vln']) ? (float)$data['vln'] : null,
            isset($data['vph']) ? (float)$data['vph'] : null,
            isset($data['nameplate']) ? (float)$data['nameplate'] : null,
            isset($data['meas_ia']) ? (float)$data['meas_ia'] : null,
            isset($data['meas_ib']) ? (float)$data['meas_ib'] : null,
            isset($data['meas_ic']) ? (float)$data['meas_ic'] : null,
            isset($data['meas_van']) ? (float)$data['meas_van'] : null,
            isset($data['meas_vbn']) ? (float)$data['meas_vbn'] : null,
            isset($data['meas_vcn']) ? (float)$data['meas_vcn'] : null,
            isset($data['pf_a']) ? (float)$data['pf_a'] : null,
            isset($data['pf_b']) ? (float)$data['pf_b'] : null,
            isset($data['pf_c']) ? (float)$data['pf_c'] : null,
            isset($data['phaseA']) ? (float)$data['phaseA'] : null,
            isset($data['phaseB']) ? (float)$data['phaseB'] : null,
            isset($data['phaseC']) ? (float)$data['phaseC'] : null,
            isset($data['totalLoad']) ? (float)$data['totalLoad'] : null,
            isset($data['loads']) ? json_encode($data['loads']) : null,
            $data['fileName'] ?? null,
            isset($data['savedAt']) ? date('Y-m-d H:i:s', strtotime($data['savedAt'])) : null,
            isset($data['kvaTotal']) && $data['kvaTotal'] !== '' ? (float)$data['kvaTotal'] : null,
            isset($data['vl1l2Ind']) && $data['vl1l2Ind'] !== '' ? (float)$data['vl1l2Ind'] : null,
            isset($data['vl1l3Ind']) && $data['vl1l3Ind'] !== '' ? (float)$data['vl1l3Ind'] : null,
            isset($data['vl2l3Ind']) && $data['vl2l3Ind'] !== '' ? (float)$data['vl2l3Ind'] : null,
            isset($data['vl1nInd'])  && $data['vl1nInd']  !== '' ? (float)$data['vl1nInd']  : null,
            isset($data['vl2nInd'])  && $data['vl2nInd']  !== '' ? (float)$data['vl2nInd']  : null,
            isset($data['vl3nInd'])  && $data['vl3nInd']  !== '' ? (float)$data['vl3nInd']  : null,
        ]);
        echo json_encode(['id' => $pdo->lastInsertId()]);
        break;
    case 'PUT':
        // ID is passed as query parameter (PUT /api/loadbalancing.php?id=5)
        // Read from $_GET so we don't depend on body parsing for the id.
        $id = $_GET['id'] ?? null;
        if (!$id) { http_response_code(400); echo json_encode(['error'=>'Missing id']); exit; }
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (isset($data['date']) && $data['date'] !== '') {
            $ts = strtotime(str_replace('/', '-', $data['date']));
            if ($ts !== false) {
                $data['date'] = date('Y-m-d', $ts);
            }
        }
        if (isset($data['time']) && $data['time'] !== '') {
            $ts2 = strtotime($data['time']);
            if ($ts2 !== false) {
                $data['time'] = date('H:i:s', $ts2);
            }
        }
        $stmt = $pdo->prepare(
            'UPDATE load_balancing_records SET
             branch=?,company=?,location=?,panel=?,mcb=?,mainV=?,wires=?,conductedBy=?,witnessBy=?,certifiedBy=?,
             witnessTenant=?,circType=?,date=?,time=?,refId=?,remarks=?,vll=?,vln=?,vph=?,nameplate=?,meas_ia=?,meas_ib=?,
             meas_ic=?,meas_van=?,meas_vbn=?,meas_vcn=?,pf_a=?,pf_b=?,pf_c=?,phaseA=?,phaseB=?,phaseC=?,totalLoad=?,loads=?,fileName=?,savedAt=?,
             kvaTotal=?,vl1l2Ind=?,vl1l3Ind=?,vl2l3Ind=?,vl1nInd=?,vl2nInd=?,vl3nInd=?
             WHERE id=?'
        );
        // same casting as in POST above
        $stmt->execute([
            $data['branch'] ?? null,
            $data['company'] ?? null,
            $data['location'] ?? null,
            $data['panel'] ?? null,
            isset($data['mcb']) ? (int)$data['mcb'] : null,
            isset($data['mainV']) ? (float)$data['mainV'] : null,
            $data['wires'] ?? null,
            $data['conductedBy'] ?? null,
            $data['witnessBy'] ?? null,
            $data['certifiedBy'] ?? null,
            $data['witnessTenant'] ?? null,
            $data['circType'] ?? null,
            $data['date'] ?? null,
            $data['time'] ?? null,
            $data['refId'] ?? null,
            $data['remarks'] ?? null,
            isset($data['vll']) ? (float)$data['vll'] : null,
            isset($data['vln']) ? (float)$data['vln'] : null,
            isset($data['vph']) ? (float)$data['vph'] : null,
            isset($data['nameplate']) ? (float)$data['nameplate'] : null,
            isset($data['meas_ia']) ? (float)$data['meas_ia'] : null,
            isset($data['meas_ib']) ? (float)$data['meas_ib'] : null,
            isset($data['meas_ic']) ? (float)$data['meas_ic'] : null,
            isset($data['meas_van']) ? (float)$data['meas_van'] : null,
            isset($data['meas_vbn']) ? (float)$data['meas_vbn'] : null,
            isset($data['meas_vcn']) ? (float)$data['meas_vcn'] : null,
            isset($data['pf_a']) ? (float)$data['pf_a'] : null,
            isset($data['pf_b']) ? (float)$data['pf_b'] : null,
            isset($data['pf_c']) ? (float)$data['pf_c'] : null,
            isset($data['phaseA']) ? (float)$data['phaseA'] : null,
            isset($data['phaseB']) ? (float)$data['phaseB'] : null,
            isset($data['phaseC']) ? (float)$data['phaseC'] : null,
            isset($data['totalLoad']) ? (float)$data['totalLoad'] : null,
            isset($data['loads']) ? json_encode($data['loads']) : null,
            $data['fileName'] ?? null,
            isset($data['savedAt']) ? date('Y-m-d H:i:s', strtotime($data['savedAt'])) : null,
            isset($data['kvaTotal']) && $data['kvaTotal'] !== '' ? (float)$data['kvaTotal'] : null,
            isset($data['vl1l2Ind']) && $data['vl1l2Ind'] !== '' ? (float)$data['vl1l2Ind'] : null,
            isset($data['vl1l3Ind']) && $data['vl1l3Ind'] !== '' ? (float)$data['vl1l3Ind'] : null,
            isset($data['vl2l3Ind']) && $data['vl2l3Ind'] !== '' ? (float)$data['vl2l3Ind'] : null,
            isset($data['vl1nInd'])  && $data['vl1nInd']  !== '' ? (float)$data['vl1nInd']  : null,
            isset($data['vl2nInd'])  && $data['vl2nInd']  !== '' ? (float)$data['vl2nInd']  : null,
            isset($data['vl3nInd'])  && $data['vl3nInd']  !== '' ? (float)$data['vl3nInd']  : null,
            $id
        ]);
        echo json_encode(['updated' => true]);
        break;
    case 'DELETE':
        if (!isset($_GET['id'])) { http_response_code(400); exit; }
        $stmt = $pdo->prepare('DELETE FROM load_balancing_records WHERE id = ?');
        $stmt->execute([$_GET['id']]);
        echo json_encode(['deleted' => true]);
        break;
    default:
        http_response_code(405);
}
