var consultaEstadosServices = angular.module('consultaEstadoServices', ['app.services']);

consultaEstadosServices.factory('ConsultaEstado', ['baseDataService',
    function (baseDataService) {
        return baseDataService.getService('api/consultaEstado', true, {
            saveList: { method: 'POST' },
            getTitulo: {
                method: 'GET', url: 'api/consultaEstado/titulo/:codigoRs/:numeroTramite/:codigoValidacion/:valid'
                , params: { codigoRs: '@codigoRs', numeroTramite: '@numeroTramite', codigoValidacion: '@codigoValidacion', valid: '@valid' }, isArray: false
            },
            getInformeDominio: { method: 'GET', url: 'api/consultaEstado/informe/:codigoRs/:numeroTramite/:codigoValidacion', params: { codigoRs: '@codigoRs', numeroTramite: '@numeroTramite', codigoValidacion: '@codigoValidacion' }, isArray: false }
        });
    }]);
