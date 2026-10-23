import unittest
from unittest.mock import patch, AsyncMock
import httpx
from fastapi.testclient import TestClient
from cnes_service.parsers import professionals, LayoutError, link_teams
from api.cnes import app


class CnesTests(unittest.TestCase):
    def test_rejects_unknown_cnes_and_missing_session(self):
        with TestClient(app) as client:
            self.assertEqual(client.get('/api/cnes?cnes=123').status_code, 422)
            self.assertEqual(client.get('/api/cnes?cnes=6305245').status_code, 401)

    def test_changed_professional_layout_is_not_empty_success(self):
        html='<html><table><tr><td>Nome</td><td>CNS</td><td>CBO</td></tr><tr><td>TESTE</td><td>900000000000001</td><td>123456 - TESTE</td></tr></table></html>'
        with self.assertRaises(LayoutError):
            professionals(html)

    def test_departed_team_is_not_active_assignment(self):
        rows=[{'nome':'TESTE','cns':'1'}]
        link_teams(rows,[{'ine':'0000000001','nome':'TESTE','data_desativacao':'01/01/2020','profissionais':[{'cns':'1','data_desligamento':''}]}])
        self.assertEqual(rows[0]['equipes'], [])

    def test_rh_cannot_collect_and_admin_can(self):
        original=httpx.AsyncClient
        for role,expected in [('rh',403),('administrador',200)]:
            def respond(request):
                if request.url.path.endswith('/user'):
                    return httpx.Response(200,json={'id':'f0000000-0000-0000-0000-000000000001'})
                return httpx.Response(200,json=[{'roles':[role],'disabled_at':None,'must_change_password':False,'institutional_cnes_unit_id':None}])
            collect=AsyncMock(return_value={'metadados':{'completo_no_escopo_solicitado':True}})
            with patch('api.cnes.httpx.AsyncClient',lambda **kw:original(transport=httpx.MockTransport(respond),**kw)),patch('api.cnes.collect_unit',collect):
                with TestClient(app) as client:
                    response=client.get('/api/cnes?cnes=6305245',headers={'Authorization':'Bearer FICTICIO','apikey':'PUBLICA-FICTICIA'})
                self.assertEqual(response.status_code,expected)
                self.assertEqual(collect.await_count,1 if role=='administrador' else 0)


if __name__ == '__main__':
    unittest.main()
