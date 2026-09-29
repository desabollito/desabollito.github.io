var registrosServices = angular.module('registroServices', ['app.services']);

registrosServices.factory('Registro', ['baseDataService',
    function (baseDataService) {
        return baseDataService.getService('api/registros', false, {
            obtenerRegistro: { method: 'POST', url: 'api/registros/obtenerRegistro' },
            obtenerRegistrosPorProvincia: { method: 'POST', url: 'api/registros/obtenerRegistrosPorProvincia', isArray: true },
            obtenerRegistrosHabilitadoFirmaDigital: { method: 'POST', url: 'api/registros/obtenerRegistrosHabilitadoFirmaDigital', isArray: true },
            obtenerRegistrosReincidencia: { method: 'POST', url: 'api/registros/obtenerRegistrosHabilitadoReincidencia', isArray: true }
        });
    }]);