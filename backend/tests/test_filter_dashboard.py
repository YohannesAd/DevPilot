"""Real PostgreSQL filtering-before-pagination and owner-scoped dashboard checks."""
from datetime import datetime, timezone
from secrets import token_urlsafe
from uuid import UUID, uuid4
import pytest
from sqlalchemy import event, update
from sqlalchemy.orm import Session
from app.models import Issue, Project, Label, IssueLabel, UserSession


@pytest.fixture
def account(client):
    credentials = {"email": "filters@example.com", "password": token_urlsafe(24)}
    user = client.post("/api/auth/register", json={**credentials, "display_name": "Filters"}).json()
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    return credentials, user


@pytest.fixture
def work(client, account, clean_database):
    project = client.post("/api/projects", json={"name": "Filtered"}).json()
    root = f"/api/projects/{project['id']}"
    label = client.post(root + "/labels", json={"name": "UI"}).json()
    rows = []
    for values in [
        {}, {"status": "done"}, {"priority": "low"}, {"type": "feature"},
        {"title": "Unrelated", "description": "Login 100%_"},
        {"title": "LOGIN 100percentX"},
    ]:
        rows.append(client.post(root + "/issues", json={"title": "Login 100%_", "status": "todo", "priority": "urgent", "type": "bug", **values}).json())
    for row in rows[:2]: client.put(f"{root}/issues/{row['id']}/labels/{label['id']}")
    return root, project, label, rows


def test_filters_combine_with_and_and_search_is_literal_title_only(client, work):
    root, _, label, rows = work
    query = {"status": "todo", "priority": "urgent", "type": "bug", "label_id": label["id"], "q": "  lOgIn 100%_  "}
    result = client.get(root + "/issues", params=query)
    assert result.status_code == 200
    assert [row["id"] for row in result.json()["items"]] == [rows[0]["id"]]
    assert len(client.get(root + "/issues", params={"q":"100%_"}).json()["items"]) == 4
    assert len(client.get(root + "/issues", params={"q":"login"}).json()["items"]) == 5
    assert len(client.get(root + "/issues", params={"q":"  "}).json()["items"]) == 6
    assert client.get(root + "/issues", params={"q":"' OR 1=1 --"}).json()["items"] == []
    assert client.get(root + "/issues", params={"q":"\\"}).json()["items"] == []
    assert client.get(root + "/issues", params={"label_id":str(uuid4())}).json()["items"] == []
    for field, value, count in [("status","done",1),("priority","low",1),("type","feature",1),("label_id",label["id"],2)]:
        assert len(client.get(root + "/issues",params={field:value}).json()["items"]) == count


@pytest.mark.parametrize("params", [
    {"status":"invalid"},{"status":""},{"priority":"critical"},{"type":"story"},
    {"label_id":"not-a-uuid"},{"q":"x"*201},{"limit":101},{"limit":0},{"offset":-1},
])
def test_invalid_parameters(client, account, params):
    p = client.post("/api/projects",json={"name":"Validation"}).json()
    result=client.get(f"/api/projects/{p['id']}/issues",params=params)
    assert result.status_code==422 and result.json()["error"]["code"]=="validation_error"


def test_filtering_before_paging_ties_and_board_list_agree(client, work, clean_database):
    root, project, label, _ = work
    tied=datetime(2026,1,1,tzinfo=timezone.utc)
    with Session(clean_database) as db:
        rows=[Issue(project_id=UUID(project["id"]), title=f"Needle {i}", status="review", priority="high",type="task",created_at=tied) for i in range(125)]
        db.add_all(rows)
        db.add_all([Issue(project_id=UUID(project["id"]),title=f"Unmatched {i}",status="done") for i in range(150)])
        db.flush()
        for row in rows: db.add(IssueLabel(issue_id=row.id,label_id=UUID(label["id"]),project_id=UUID(project["id"])))
        ids=sorted([str(row.id) for row in rows],reverse=True);db.commit()
    filters={"q":"needle","status":"review","priority":"high","type":"task","label_id":label["id"]}
    board=[client.get(root+"/issues",params={**filters,"limit":100,"offset":offset}).json() for offset in [0,100]]
    listing=[client.get(root+"/issues",params={**filters,"limit":20,"offset":offset}).json() for offset in range(0,125,20)]
    assert [row["id"] for page in board for row in page["items"]] == ids
    assert [row["id"] for page in listing for row in page["items"]] == ids
    assert board[0]["has_more"] and not board[1]["has_more"]
    assert client.get(root+"/issues",params={**filters,"offset":125}).json()=={"items":[],"has_more":False}
    # Moving a loaded matching row out shifts the next filtered offset by one.
    assert client.patch(root+"/issues/"+ids[0],json={"status":"done"}).status_code==200
    rest=client.get(root+"/issues",params={**filters,"limit":100,"offset":99}).json()
    assert [row["id"] for row in rest["items"]]==ids[100:]


def test_filters_project_ownership_label_scope_and_archived_read(client, account, work):
    root, project, label, _=work
    p=client.post("/api/projects",json={"name":"Other project"}).json()
    foreign=client.post(f"/api/projects/{p['id']}/labels",json={"name":"Foreign"}).json()
    assert client.get(root+"/issues",params={"label_id":foreign["id"]}).json()["items"]==[]
    client.post(root+"/archive",json={})
    assert len(client.get(root+"/issues",params={"label_id":label["id"]}).json()["items"])==2
    client.post("/api/auth/logout")
    creds={"email":"foreign-filter@example.com","password":token_urlsafe(24)}
    client.post("/api/auth/register",json={**creds,"display_name":"Other"});client.post("/api/auth/login",json=creds)
    assert client.get(root+"/issues",params={"q":"Login"}).status_code==404
    assert client.get("/api/dashboard").json()["total_issues"]==0


def test_dashboard_empty_and_authentication(client, account, clean_database):
    response=client.get("/api/dashboard")
    assert response.status_code==200
    assert response.headers["cache-control"]=="no-store"
    assert response.json()=={"active_projects":0,"total_issues":0,
        "status_counts":dict.fromkeys(["backlog","todo","in_progress","review","done"],0),"recent_projects":[],"recent_issues":[]}
    with clean_database.begin() as db: db.execute(update(UserSession).values(expires_at=datetime(2000,1,1,tzinfo=timezone.utc)))
    assert client.get("/api/dashboard").status_code==401
    client.cookies.clear()
    assert client.get("/api/dashboard").status_code==401


def test_dashboard_counts_recent_order_archive_restore_and_owner_scope(client, account, clean_database):
    statuses=["backlog","todo","in_progress","review","done"]
    tied=datetime(2026,1,1,tzinfo=timezone.utc)
    with Session(clean_database) as db:
        projects=[Project(owner_id=UUID(account[1]["id"]),name=f"Active {i}",updated_at=tied) for i in range(7)]
        archived=Project(owner_id=UUID(account[1]["id"]),name="Archived",archived_at=tied)
        db.add_all([*projects,archived]);db.flush()
        issues=[Issue(project_id=projects[0].id,title=f"Active issue {i}",status=statuses[i%5],updated_at=tied) for i in range(12)]
        db.add_all([*issues,Issue(project_id=archived.id,title="Excluded",status="done")]);db.flush()
        ids=sorted([str(row.id) for row in issues],reverse=True)
        project_ids=sorted([str(row.id) for row in projects],reverse=True)
        archive_id=str(archived.id);db.commit()
    # Another owner's newer work must never enter aggregates or recent lists.
    credentials={"email":"dashboard-other@example.com","password":token_urlsafe(24)}
    client.post("/api/auth/register",json={**credentials,"display_name":"Other"})
    client.post("/api/auth/logout");client.post("/api/auth/login",json=credentials)
    other=client.post("/api/projects",json={"name":"Foreign"}).json()
    client.post(f"/api/projects/{other['id']}/issues",json={"title":"Foreign issue"})
    client.post("/api/auth/logout");client.post("/api/auth/login",json=account[0])
    statements=[]
    def capture(_c,_cur,statement,_params,_ctx,_many): statements.append(statement)
    event.listen(clean_database,"before_cursor_execute",capture)
    try: result=client.get("/api/dashboard").json()
    finally: event.remove(clean_database,"before_cursor_execute",capture)
    assert result["active_projects"]==7 and result["total_issues"]==12
    assert result["status_counts"]=={"backlog":3,"todo":3,"in_progress":2,"review":2,"done":2}
    assert [row["id"] for row in result["recent_issues"]]==ids[:6]
    assert [row["id"] for row in result["recent_projects"]]==project_ids[:4]
    assert len([s for s in statements if "GROUP BY issues.status" in s])==1
    assert len([s for s in statements if "JOIN labels" in s])==0
    assert len([s for s in statements if s.lstrip().upper().startswith("SELECT")])<=6
    client.post(f"/api/projects/{archive_id}/restore",json={})
    restored=client.get("/api/dashboard").json()
    assert restored["active_projects"]==8 and restored["total_issues"]==13 and restored["status_counts"]["done"]==3
    client.post(f"/api/projects/{project_ids[0]}/archive",json={})
    assert client.get("/api/dashboard").json()["active_projects"]==7
