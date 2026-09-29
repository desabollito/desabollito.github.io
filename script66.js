var precargaServices = angular.module('precargaServices', ['app.services']);

precargaServices.factory('precargaServices', ['baseDataService',
    function (baseDataService) {
        return baseDataService.getService('api/precarga', false, {
            //inscripcion/ { CDP } / { chasis }
            validarPrecarga: { method: 'GET', url: 'api/precarga/:CDP/:nroEndoso/:chasis', params: { CDP: '@CDP', nroEndoso: '@nroEndoso', chasis: '@chasis' } },
            validarInscripcionPrenda: { method: 'GET', url: 'api/precarga/inscripcion/:CDP/:chasis', params: { CDP: '@CDP', chasis: '@chasis' } }
        });
    }]);